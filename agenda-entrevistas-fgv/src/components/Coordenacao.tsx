import { useMemo, useState, type FormEvent } from 'react';
import { CONFIG } from '../config';
import { CAPACIDADE_POR_BANCA, CAPACIDADE_TOTAL, DIA_POR_ID, DIAS, ESTADOS, FAIXA_POR_ID, SLOT_POR_ID, TOTAL_BANCAS } from '../data/grade';
import { calcularKpis, filtrarReservas, type FiltrosReserva } from '../lib/coordenacao';
import type { Estado, Reserva } from '../lib/types';
import { urlValida } from '../services/appsScript';
import { baixarCsv, baixarXlsx, formatarTimestamp } from '../services/exportacao';
import type { Sincronizador, StatusSync } from '../services/sincronizador';
import { BadgeSync } from './Cabecalho';
import { Modal } from './Modal';

export function ModalSenha({
  aberto,
  aoFechar,
  aoDesbloquear,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoDesbloquear: () => void;
}) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(false);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (senha === CONFIG.senhaCoordenacao) {
      setSenha('');
      setErro(false);
      aoDesbloquear();
    } else setErro(true);
  };
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Área da Coordenação">
      <form onSubmit={enviar} className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          Senha de acesso
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value);
              setErro(false);
            }}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-fgv-azul focus:ring-2 focus:ring-sky-200"
          />
        </label>
        {erro && <p className="text-sm text-red-600">Senha incorreta.</p>}
        <button type="submit" className="w-full rounded-lg bg-fgv-marinho py-2.5 text-sm font-bold text-white">
          Entrar
        </button>
      </form>
    </Modal>
  );
}

function Kpi({ rotulo, valor, destaque }: { rotulo: string; valor: string | number; destaque?: string }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`mt-1 text-2xl font-extrabold ${destaque ?? 'text-fgv-marinho'}`}>{valor}</p>
    </div>
  );
}

export function PainelCoordenacao({
  aberto,
  aoFechar,
  reservas,
  status,
  ultimaSync,
  pendentes,
  mensagem,
  endpoint,
  sync,
}: {
  aberto: boolean;
  aoFechar: () => void;
  reservas: Reserva[];
  status: StatusSync;
  ultimaSync: string | null;
  pendentes: number;
  mensagem: string | null;
  endpoint: string;
  sync: Sincronizador;
}) {
  const [filtros, setFiltros] = useState<FiltrosReserva>({ dia: '', estado: '', busca: '' });
  const [url, setUrl] = useState(endpoint);
  const [aviso, setAviso] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  const kpis = useMemo(() => calcularKpis(reservas), [reservas]);
  const lista = useMemo(() => filtrarReservas(reservas, filtros), [reservas, filtros]);

  const salvarUrl = async (e: FormEvent) => {
    e.preventDefault();
    if (url.trim() && !urlValida(url)) {
      setAviso('Informe uma URL https válida (termina em /exec).');
      return;
    }
    sync.definirEndpoint(url);
    setAviso(url.trim() ? 'Endpoint salvo. Sincronizando…' : 'Endpoint removido: modo local.');
    await sync.sincronizar();
    setAviso(null);
  };

  const remover = async (r: Reserva) => {
    if (!window.confirm(`Remover a reserva de ${r.nome} em ${r.slotId}?`)) return;
    try {
      await sync.remover(r.id, CONFIG.senhaCoordenacao);
    } catch (e) {
      window.alert(`Não foi possível remover: ${e instanceof Error ? e.message : e}`);
    }
  };

  const xlsx = async () => {
    setBaixando(true);
    try {
      await baixarXlsx(reservas.filter((r) => !r.pendente));
    } finally {
      setBaixando(false);
    }
  };

  const seletor = 'rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-fgv-azul';

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Área da Coordenação" largura="max-w-6xl" telaCheiaMobile>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BadgeSync status={status} ultimaSync={ultimaSync} pendentes={pendentes} mensagem={mensagem} />
          <button
            type="button"
            onClick={() => void sync.sincronizar()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            ↻ Sincronizar agora
          </button>
        </div>
        {mensagem && status === 'erro' && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{mensagem}</p>}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores">
          <Kpi rotulo="Total de Bancas" valor={TOTAL_BANCAS} />
          <Kpi rotulo="Capacidade Máxima" valor={CAPACIDADE_TOTAL} />
          <Kpi rotulo="Reservas Registradas" valor={kpis.reservas} destaque="text-sky-700" />
          <Kpi rotulo={`Bancas Lotadas (${CAPACIDADE_POR_BANCA}/${CAPACIDADE_POR_BANCA})`} valor={kpis.lotadas} destaque="text-amber-600" />
        </section>
        <p className="-mt-2 text-xs text-slate-500">
          {kpis.participantes} participante(s) · {kpis.vagasLivres} vaga(s) livre(s) · ocupação {kpis.percentual}%
        </p>

        <section className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <h3 className="mb-1 text-sm font-bold text-fgv-marinho">Extração da Planilha</h3>
          <p className="mb-3 text-xs text-slate-600">
            Arquivo com 2 abas: <strong>Reservas</strong> (lista completa) e <strong>Matriz_Vagas</strong> (100 bancas com
            ocupação, status e inscritos).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={xlsx}
              disabled={baixando}
              className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-emerald-800 disabled:opacity-50"
            >
              {baixando ? 'Gerando…' : '⬇ Baixar Planilha Excel (.xlsx)'}
            </button>
            <button
              type="button"
              onClick={() => baixarCsv(reservas.filter((r) => !r.pendente))}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Exportar CSV
            </button>
          </div>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <h3 className="mr-auto text-sm font-bold text-fgv-marinho">
              Reservas ({lista.length}
              {lista.length !== reservas.length && ` de ${reservas.length}`})
            </h3>
            <select
              aria-label="Filtrar por dia"
              className={seletor}
              value={filtros.dia}
              onChange={(e) => setFiltros({ ...filtros, dia: e.target.value })}
            >
              <option value="">Todos os dias</option>
              {DIAS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.data} ({d.semana})
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar por estado"
              className={seletor}
              value={filtros.estado}
              onChange={(e) => setFiltros({ ...filtros, estado: e.target.value as Estado | '' })}
            >
              <option value="">Todos os estados</option>
              {(Object.keys(ESTADOS) as Estado[]).map((uf) => (
                <option key={uf} value={uf}>
                  {uf === 'LIVRE' ? 'Livre' : `${uf} — ${ESTADOS[uf].nome}`}
                </option>
              ))}
            </select>
            <input
              type="search"
              placeholder="Buscar por nome ou e-mail"
              aria-label="Buscar por nome"
              className={`${seletor} w-full sm:w-56`}
              value={filtros.busca}
              onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
            />
          </div>
          <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-fgv-marinho text-xs text-white">
                <tr>
                  {['Data/Hora', 'Slot', 'Dia', 'Horário', 'Banca', 'Grupo', 'Nome', 'E-mail', ''].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                      Nenhuma reserva encontrada.
                    </td>
                  </tr>
                )}
                {lista.map((r) => {
                  const s = SLOT_POR_ID[r.slotId];
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-500">
                        {formatarTimestamp(r.timestamp)}
                        {r.pendente && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">pendente</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.slotId}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{s ? `${DIA_POR_ID[s.diaId].data} ${DIA_POR_ID[s.diaId].semana}` : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{s ? FAIXA_POR_ID[s.faixaId].label : '—'}</td>
                      <td className="px-3 py-2">{s?.banca}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {s && <span className={`uf-${s.estado} rounded px-1.5 py-0.5 text-xs font-semibold`}>{s.rotulo}</span>}
                      </td>
                      <td className="px-3 py-2">{r.nome}</td>
                      <td className="px-3 py-2 text-xs">{r.email}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void remover(r)}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <h3 className="mb-1 text-sm font-bold text-fgv-marinho">Conexão com o Google Sheets (Apps Script)</h3>
          <p className="mb-3 text-xs text-slate-600">
            Cole a URL do Web App implantado (termina em <code>/exec</code>). Deixe vazio para usar apenas o armazenamento
            local deste aparelho. A URL fica salva neste navegador.
          </p>
          <form onSubmit={salvarUrl} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
              className={`${seletor} flex-1 font-mono text-xs`}
            />
            <button type="submit" className="rounded-lg bg-fgv-marinho px-4 py-2 text-sm font-bold text-white">
              Salvar URL
            </button>
            {CONFIG.appsScriptUrl && url !== CONFIG.appsScriptUrl && (
              <button
                type="button"
                onClick={() => setUrl(CONFIG.appsScriptUrl)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Restaurar padrão
              </button>
            )}
          </form>
          {aviso && <p className="mt-2 text-xs text-sky-800">{aviso}</p>}
        </section>
      </div>
    </Modal>
  );
}
