import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CONFIG } from '../config';
import {
  CAPACIDADE_POR_BANCA,
  CAPACIDADE_TOTAL,
  DIA_POR_ID,
  DIAS,
  ESTADOS,
  FAIXA_POR_ID,
  FAIXAS,
  SLOT_POR_ID,
  TOTAL_BANCAS,
} from '../data/grade';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { calcularKpis, filtrarReservas, ocupacaoPorFaixa, type CelulaOcupacao, type FiltrosReserva } from '../lib/coordenacao';
import { abreviarSemana } from '../lib/filtros';
import type { Estado, Reserva } from '../lib/types';
import { urlValida } from '../services/appsScript';
import { baixarCsv, baixarXlsx, formatarTimestamp } from '../services/exportacao';
import type { Sincronizador, StatusSync } from '../services/sincronizador';
import { Modal } from './Modal';
import { ResultadosRanking } from './ResultadosRanking';

export function ModalSenha({
  aberto,
  aoFechar,
  aoDesbloquear,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoDesbloquear: (senha: string) => void;
}) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(false);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (CONFIG.verificarSenha(senha)) {
      const correta = senha;
      setSenha('');
      setErro(false);
      aoDesbloquear(correta);
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

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------
function CardKpi({
  rotulo,
  valor,
  detalhe,
  destaque = 'text-fgv-marinho',
  children,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  destaque?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200">
      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{rotulo}</p>
      <p className={`mt-1 text-2xl leading-tight font-extrabold tabular-nums ${destaque}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>}
      {children}
    </div>
  );
}

const TEXTO_STATUS: Record<StatusSync, { texto: string; cor: string }> = {
  local: { texto: 'Modo local', cor: 'text-slate-700' },
  sincronizando: { texto: 'Sincronizando…', cor: 'text-sky-700' },
  online: { texto: 'Sincronizado', cor: 'text-emerald-700' },
  offline: { texto: 'Offline', cor: 'text-amber-700' },
  erro: { texto: 'Erro', cor: 'text-red-700' },
};

// ---------------------------------------------------------------------------
// Mapa de ocupação por dia/faixa
// ---------------------------------------------------------------------------
function corCelula(c: CelulaOcupacao): string {
  const p = c.preenchidas / c.capacidade;
  if (p >= 1) return 'bg-fgv-marinho text-white ring-fgv-marinho';
  if (p >= 0.75) return 'bg-sky-700 text-white ring-sky-700';
  if (p >= 0.5) return 'bg-sky-400 text-white ring-sky-400';
  if (p > 0) return 'bg-sky-100 text-sky-900 ring-sky-200';
  return 'bg-white text-slate-500 ring-slate-200';
}

function MapaOcupacao({
  reservas,
  selecionada,
  aoSelecionar,
}: {
  reservas: Reserva[];
  selecionada: { dia: string; faixa: string } | null;
  aoSelecionar: (dia: string, faixa: string) => void;
}) {
  const matriz = useMemo(() => ocupacaoPorFaixa(reservas), [reservas]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="w-24" />
            {DIAS.map((d) => (
              <th key={d.id} className="pb-1 font-semibold text-slate-600">
                {d.data} <span className="font-normal text-slate-400">{abreviarSemana(d.semana)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matriz.map((linha, i) => (
            <tr key={FAIXAS[i].id}>
              <th scope="row" className="pr-1 text-left font-semibold whitespace-nowrap text-slate-600 tabular-nums">
                {FAIXAS[i].label}
              </th>
              {linha.map((c) => {
                const ativa = selecionada?.dia === c.diaId && selecionada?.faixa === c.faixaId;
                return (
                  <td key={c.diaId}>
                    <button
                      type="button"
                      onClick={() => aoSelecionar(c.diaId, c.faixaId)}
                      aria-pressed={ativa}
                      title={c.bancas.map((b) => `Banca ${b.banca} (${b.rotulo}): ${b.ocupacao}/${CAPACIDADE_POR_BANCA}`).join('\n')}
                      aria-label={`${DIA_POR_ID[c.diaId].data} ${FAIXA_POR_ID[c.faixaId].label}: ${c.preenchidas} de ${c.capacidade} vagas, ${c.lotadas} bancas lotadas`}
                      className={`w-full rounded-lg px-2 py-1.5 text-left ring-1 transition hover:brightness-95 ${corCelula(c)} ${
                        ativa ? 'outline-[3px] outline-offset-1 outline-fgv-ouro outline' : ''
                      }`}
                    >
                      <span className="block font-bold tabular-nums">
                        {c.preenchidas}/{c.capacidade}
                      </span>
                      <span className="mt-1 flex gap-0.5" aria-hidden>
                        {c.bancas.map((b) => (
                          <span key={b.banca} className="flex flex-1 gap-px">
                            {Array.from({ length: CAPACIDADE_POR_BANCA }, (_, k) => (
                              <span
                                key={k}
                                className={`h-1.5 flex-1 rounded-sm ${k < b.ocupacao ? 'bg-current opacity-90' : 'bg-current opacity-20'}`}
                              />
                            ))}
                          </span>
                        ))}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-slate-500">
        Cada célula soma as 4 bancas (A–D) da faixa: 8 vagas. As barrinhas mostram A, B, C e D. Clique para filtrar a tabela.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------
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
  token,
}: {
  token: string;
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
  const [aba, setAba] = useState<'reservas' | 'resultados'>('reservas');
  const [filtros, setFiltros] = useState<FiltrosReserva>({ dia: '', estado: '', busca: '', faixa: '' });
  const [url, setUrl] = useState(endpoint);
  const [aviso, setAviso] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const refTabela = useRef<HTMLElement>(null);
  const telaLarga = useMediaQuery('(min-width: 640px)');

  const kpis = useMemo(() => calcularKpis(reservas), [reservas]);
  const lista = useMemo(() => filtrarReservas(reservas, filtros), [reservas, filtros]);
  const preenchidas = CAPACIDADE_TOTAL - kpis.vagasLivres;
  const filtrosAtivos = Boolean(filtros.dia || filtros.estado || filtros.busca || filtros.faixa);
  const hora = ultimaSync ? new Date(ultimaSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;

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
      await sync.remover(r.id, token);
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

  const filtrarCelula = (dia: string, faixa: string) => {
    const mesma = filtros.dia === dia && filtros.faixa === faixa;
    setFiltros({ ...filtros, dia: mesma ? '' : dia, faixa: mesma ? '' : faixa });
    if (!mesma) refTabela.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const seletor = 'rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-fgv-azul';

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Área da Coordenação" largura="max-w-6xl" telaCheiaMobile>
      <div className="space-y-5">
        <nav className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold" aria-label="Seções da coordenação">
          {(
            [
              ['reservas', 'Reservas & Ocupação'],
              ['resultados', 'Resultados & Ranking'],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              aria-current={aba === id ? 'page' : undefined}
              onClick={() => setAba(id)}
              className={`flex-1 rounded-lg px-3 py-2 transition ${
                aba === id ? 'bg-white text-fgv-marinho shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </nav>

        {aba === 'resultados' ? (
          <ResultadosRanking sync={sync} token={token} />
        ) : (
        <>
        {/* Ações principais */}
        <div className="flex flex-col gap-2 rounded-xl bg-gradient-to-r from-fgv-marinho to-fgv-azul p-3 text-white sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            <strong>Extração da Planilha</strong>
            <span className="block text-xs text-sky-100">
              Excel com 2 abas: <strong>Reservas</strong> e <strong>Matriz_Vagas</strong> (100 bancas, ocupação e inscritos).
            </span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={xlsx}
              disabled={baixando}
              className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-emerald-600 disabled:opacity-50"
            >
              {baixando ? 'Gerando…' : '⬇ Baixar Planilha Excel (.xlsx)'}
            </button>
            <button
              type="button"
              onClick={() => baixarCsv(reservas.filter((r) => !r.pendente))}
              className="rounded-lg bg-white/15 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-white/25"
            >
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Indicadores */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores">
          <CardKpi rotulo="Total de Bancas" valor={TOTAL_BANCAS} detalhe={`${CAPACIDADE_TOTAL} vagas (${CAPACIDADE_POR_BANCA} por banca)`} />
          <CardKpi
            rotulo="Vagas preenchidas"
            valor={
              <>
                {preenchidas}
                <span className="text-base font-semibold text-slate-400">/{CAPACIDADE_TOTAL}</span>
              </>
            }
            detalhe={`${kpis.reservas} reservas · ${kpis.participantes} avaliador(es)`}
            destaque="text-sky-700"
          />
          <CardKpi rotulo="Ocupação" valor={`${kpis.percentual}%`} detalhe={`${kpis.lotadas} banca(s) lotada(s) (2/2)`} destaque="text-amber-600">
            <span className="mt-2 block h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <span className="block h-full rounded-full bg-amber-500 transition-all" style={{ width: `${kpis.percentual}%` }} />
            </span>
          </CardKpi>
          <CardKpi
            rotulo="Sincronização"
            valor={<span className={`text-lg ${TEXTO_STATUS[status].cor}`}>{TEXTO_STATUS[status].texto}</span>}
            detalhe={
              status === 'local'
                ? 'Sem planilha conectada'
                : `${hora ? `Última às ${hora}` : 'Ainda não sincronizado'}${pendentes > 0 ? ` · ${pendentes} pendente(s)` : ''}`
            }
          >
            <button
              type="button"
              onClick={() => void sync.sincronizar()}
              className="mt-2 self-start rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              ↻ Sincronizar agora
            </button>
          </CardKpi>
        </section>
        {status === 'offline' && (
          <p className="-mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Sem conexão com a planilha no momento. Os números abaixo usam os dados salvos neste aparelho e serão atualizados
            assim que a conexão voltar.
          </p>
        )}
        {status === 'erro' && mensagem && (
          <p className="-mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">A planilha respondeu com erro: {mensagem}</p>
        )}

        {/* Ocupação por dia/faixa */}
        <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <h3 className="mb-2 text-sm font-bold text-fgv-marinho">Ocupação por dia e faixa horária</h3>
          <MapaOcupacao
            reservas={reservas}
            selecionada={filtros.dia && filtros.faixa ? { dia: filtros.dia, faixa: filtros.faixa } : null}
            aoSelecionar={filtrarCelula}
          />
        </section>

        {/* Reservas */}
        <section ref={refTabela} className="scroll-mt-4">
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
              aria-label="Filtrar por faixa horária"
              className={seletor}
              value={filtros.faixa ?? ''}
              onChange={(e) => setFiltros({ ...filtros, faixa: e.target.value })}
            >
              <option value="">Todos os horários</option>
              {FAIXAS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
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
            {filtrosAtivos && (
              <button
                type="button"
                onClick={() => setFiltros({ dia: '', estado: '', busca: '', faixa: '' })}
                className="px-1 py-2 text-xs font-semibold text-fgv-azul hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>

          {lista.length === 0 ? (
            <p className="rounded-xl bg-white px-3 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
              Nenhuma reserva encontrada.
            </p>
          ) : telaLarga ? (
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
          ) : (
            <ul className="space-y-2">
              {lista.map((r) => {
                const s = SLOT_POR_ID[r.slotId];
                return (
                  <li key={r.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{r.nome}</p>
                        <p className="truncate text-xs text-slate-500">{r.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void remover(r)}
                        className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50"
                      >
                        Remover
                      </button>
                    </div>
                    {s && (
                      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                        <span className={`uf-${s.estado} rounded px-1.5 py-0.5 font-semibold`}>{s.rotulo}</span>
                        {DIA_POR_ID[s.diaId].data} {abreviarSemana(DIA_POR_ID[s.diaId].semana)} · {FAIXA_POR_ID[s.faixaId].label} · Banca{' '}
                        {s.banca}
                        {r.pendente && <span className="rounded bg-amber-100 px-1 text-amber-800">pendente</span>}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-400">{formatarTimestamp(r.timestamp)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Configuração avançada */}
        <details className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <summary className="cursor-pointer text-sm font-bold text-fgv-marinho">Conexão com o Google Sheets (Apps Script)</summary>
          <p className="mt-2 mb-3 text-xs text-slate-600">
            Cole a URL do Web App implantado (termina em <code>/exec</code>). Deixe vazio para usar apenas o armazenamento local
            deste aparelho. A URL fica salva neste navegador.
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
        </details>
        </>
        )}
      </div>
    </Modal>
  );
}
