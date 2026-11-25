import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BannerInstalacao } from './components/BannerInstalacao';
import { BarraSelecao } from './components/BarraSelecao';
import { Cabecalho } from './components/Cabecalho';
import { ModalSenha, PainelCoordenacao } from './components/Coordenacao';
import { GradeDesktop } from './components/Grade';
import { BarraFiltros, GradeDia, SeletorDias } from './components/GradeDia';
import { Identificacao } from './components/Identificacao';
import { Legenda } from './components/Legenda';
import { Modal } from './components/Modal';
import { ResumoSelecao } from './components/ResumoSelecao';
import { DIAS, descreverSlot, SLOT_POR_ID } from './data/grade';
import { useAgenda } from './hooks/useAgenda';
import { useMediaQuery } from './hooks/useMediaQuery';
import { usePersistente } from './hooks/usePersistente';
import { FILTROS_VAZIOS, type FiltrosGrade } from './lib/filtros';
import {
  alternarSelecao,
  contarPorSlot,
  estadoDoSlot,
  MENSAGEM_MOTIVO,
  reservasDoParticipante,
  sanearSelecao,
  validarEnvio,
  validarIdentificacao,
} from './lib/regras';
import type { Participante, Rejeicao, Reserva } from './lib/types';
import { CHAVES } from './services/armazenamento';

function lerSessao(chave: string): string | null {
  try {
    return sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravarSessao(chave: string, valor: string): void {
  try {
    sessionStorage.setItem(chave, valor);
  } catch {
    /* ignora */
  }
}

interface Resultado {
  aceitas: Reserva[];
  rejeitadas: Rejeicao[];
  enfileirado: boolean;
  erro?: string;
}

export default function App() {
  const agenda = useAgenda();
  const { reservas, sync } = agenda;
  const desktop = useMediaQuery('(min-width: 768px)');

  const [participante, setParticipante] = usePersistente<Participante>(CHAVES.participante, { nome: '', email: '' });
  const [selecao, setSelecao] = usePersistente<string[]>(CHAVES.selecao, []);
  const [mostrarErros, setMostrarErros] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [painelAberto, setPainelAberto] = useState(false);
  const refIdent = useRef<HTMLElement>(null);
  const [diaAtivo, setDiaAtivo] = useState(DIAS[0].id);
  const [filtros, setFiltros] = useState<FiltrosGrade>(FILTROS_VAZIOS);
  const [visao, setVisao] = useState<'dia' | 'semana'>('dia');

  const ocupacao = useMemo(() => contarPorSlot(reservas), [reservas]);
  const minhas = useMemo(() => reservasDoParticipante(participante.email, reservas), [participante.email, reservas]);
  const confirmados = useMemo(() => minhas.map((r) => r.slotId), [minhas]);
  const erros = useMemo(() => validarIdentificacao(participante), [participante]);

  // Mantém a seleção coerente quando chegam novas reservas (ex.: banca lotou) ou o e-mail muda.
  useEffect(() => {
    setSelecao((atual) => {
      const saneada = sanearSelecao(atual, reservas, participante.email);
      return saneada.length === atual.length ? atual : saneada;
    });
  }, [reservas, participante.email, setSelecao]);

  const estadoDe = useCallback(
    (slotId: string) => estadoDoSlot(slotId, selecao, reservas, participante.email),
    [selecao, reservas, participante.email],
  );
  const aoAlternar = useCallback(
    (slotId: string) => setSelecao((atual) => alternarSelecao(slotId, atual, reservas, participante.email)),
    [reservas, participante.email, setSelecao],
  );

  const pedirConfirmacao = () => {
    setMostrarErros(true);
    if (Object.keys(erros).length > 0) {
      refIdent.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setRevisando(true);
  };

  const enviar = async () => {
    const v = validarEnvio(participante, selecao, reservas);
    if (!v.ok && Object.keys(v.erros).length > 0) {
      setRevisando(false);
      return;
    }
    setEnviando(true);
    try {
      // Revalidação final acontece no Sincronizador / Apps Script (com LockService).
      const r = await sync.confirmar(participante, selecao);
      const aceitosIds = new Set(r.aceitas.map((a) => a.slotId));
      setSelecao((atual) => atual.filter((id) => !aceitosIds.has(id)));
      setResultado(r);
    } catch (e) {
      setResultado({ aceitas: [], rejeitadas: [], enfileirado: false, erro: e instanceof Error ? e.message : String(e) });
    } finally {
      setEnviando(false);
      setRevisando(false);
    }
  };

  const removerDaSelecao = (id: string) => setSelecao((atual) => atual.filter((x) => x !== id));
  const limparSelecao = () => setSelecao([]);
  const verSemana = desktop && visao === 'semana';

  return (
    <div className="min-h-dvh pb-48 md:pb-0">
      <BannerInstalacao />
      <Cabecalho status={agenda.status} ultimaSync={agenda.ultimaSync} pendentes={agenda.pendentes} mensagem={agenda.mensagem} />

      <div className="mx-auto max-w-7xl px-4 py-5 md:grid md:grid-cols-[minmax(0,1fr)_280px] md:items-start md:gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-5">
          <Identificacao
            ref={refIdent}
            participante={participante}
            aoAlterar={setParticipante}
            erros={erros}
            mostrarErros={mostrarErros}
            confirmados={minhas.length}
            selecionados={selecao.length}
          />

          <section aria-labelledby="etapa2" className="space-y-3">
            <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="etapa2" className="flex items-center gap-2 text-base font-bold text-fgv-marinho">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-fgv-marinho text-xs text-white">2</span>
                  Escolha suas bancas
                </h2>
                {desktop && (
                  <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold" role="group" aria-label="Modo de visualização">
                    {(['dia', 'semana'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={visao === v}
                        onClick={() => setVisao(v)}
                        className={`rounded-md px-3 py-1.5 transition ${
                          visao === v ? 'bg-white text-fgv-marinho shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {v === 'dia' ? 'Por dia' : 'Semana inteira'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-sm text-slate-600">
                Marque quantos horários desejar. Em cada faixa horária de um mesmo dia é possível escolher{' '}
                <strong>apenas 1 banca</strong> (A, B, C ou D). Cada banca comporta no máximo <strong>2 avaliadores</strong>.
              </p>
              <Legenda />
            </div>

            {verSemana ? (
              <GradeDesktop estadoDe={estadoDe} ocupacao={ocupacao} aoAlternar={aoAlternar} />
            ) : (
              <>
                <div className="sticky top-0 z-20 -mx-4 space-y-2 bg-fundo/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:rounded-2xl md:bg-white md:p-3 md:shadow-sm md:ring-1 md:ring-slate-200">
                  <SeletorDias diaAtivo={diaAtivo} aoTrocar={setDiaAtivo} selecao={selecao} ocupacao={ocupacao} />
                  <BarraFiltros filtros={filtros} aoMudar={setFiltros} />
                </div>
                <GradeDia
                  diaAtivo={diaAtivo}
                  filtros={filtros}
                  estadoDe={estadoDe}
                  ocupacao={ocupacao}
                  selecao={selecao}
                  confirmados={confirmados}
                  aoAlternar={aoAlternar}
                  aoLimparFiltros={() => setFiltros(FILTROS_VAZIOS)}
                />
              </>
            )}
          </section>

          {!desktop && minhas.length > 0 && (
            <section className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
              <h2 className="mb-2 text-sm font-bold text-emerald-900">Seus horários confirmados ({minhas.length})</h2>
              <ul className="flex flex-wrap gap-2">
                {[...minhas]
                  .sort((a, b) => a.slotId.localeCompare(b.slotId))
                  .map((r) => (
                    <li key={r.id} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-900 ring-1 ring-emerald-300">
                      {descreverSlot(r.slotId)} · {SLOT_POR_ID[r.slotId]?.rotulo}
                      {r.pendente && <span className="ml-1 text-amber-700">(aguardando envio)</span>}
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-xs text-emerald-800">Para cancelar um horário confirmado, entre em contato com a coordenação.</p>
            </section>
          )}
        </main>

        {desktop && (
          <ResumoSelecao
            selecao={selecao}
            confirmadas={minhas}
            aoRemover={removerDaSelecao}
            aoLimpar={limparSelecao}
            aoConfirmar={pedirConfirmacao}
            enviando={enviando}
          />
        )}
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} FGV DGPE · Agenda das Bancas</p>
          <button
            type="button"
            onClick={() => (lerSessao(CHAVES.coordenacao) === '1' ? setPainelAberto(true) : setSenhaAberta(true))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
          >
            🔒 Área da Coordenação
          </button>
        </div>
      </footer>

      {!desktop && (
        <BarraSelecao
          selecao={selecao}
          aoRemover={removerDaSelecao}
          aoLimpar={limparSelecao}
          aoConfirmar={pedirConfirmacao}
          enviando={enviando}
        />
      )}

      <Modal aberto={revisando} aoFechar={() => !enviando && setRevisando(false)} titulo="Confirmar seleção">
        <p className="text-sm text-slate-700">
          <strong>{participante.nome.trim()}</strong> · {participante.email.trim()}
        </p>
        <ul className="mt-3 space-y-1.5">
          {selecao.map((id) => (
            <li key={id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className={`uf-${SLOT_POR_ID[id].estado} rounded px-1.5 py-0.5 text-xs font-bold`}>{SLOT_POR_ID[id].rotulo}</span>
              {descreverSlot(id)}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={enviando}
            onClick={() => setRevisando(false)}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700"
          >
            Voltar
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => void enviar()}
            className="flex-1 rounded-lg bg-fgv-marinho py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {enviando ? 'Enviando…' : 'Confirmar e enviar'}
          </button>
        </div>
      </Modal>

      <Modal aberto={resultado !== null} aoFechar={() => setResultado(null)} titulo="Resultado do envio">
        {resultado?.erro ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            Não foi possível registrar: {resultado.erro}. Sua seleção foi mantida — tente novamente.
          </p>
        ) : (
          resultado && (
            <div className="space-y-3 text-sm">
              {resultado.aceitas.length > 0 && (
                <div className="rounded-lg bg-emerald-50 p-3 text-emerald-900">
                  <p className="font-bold">
                    ✓ {resultado.aceitas.length} horário(s) {resultado.enfileirado ? 'salvo(s) no aparelho' : 'confirmado(s)'}
                  </p>
                  {resultado.enfileirado && (
                    <p className="mt-1 text-xs">Sem conexão com a planilha agora. O envio será feito automaticamente assim que a conexão voltar.</p>
                  )}
                  <ul className="mt-2 list-disc pl-5 text-xs">
                    {resultado.aceitas.map((a) => (
                      <li key={a.id}>{descreverSlot(a.slotId)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {resultado.rejeitadas.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
                  <p className="font-bold">{resultado.rejeitadas.length} horário(s) não puderam ser reservados</p>
                  <ul className="mt-2 list-disc pl-5 text-xs">
                    {resultado.rejeitadas.map((r) => (
                      <li key={r.slotId}>
                        {descreverSlot(r.slotId)} — {MENSAGEM_MOTIVO[r.motivo] ?? r.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        )}
        <button type="button" onClick={() => setResultado(null)} className="mt-5 w-full rounded-lg bg-fgv-marinho py-2.5 text-sm font-bold text-white">
          OK
        </button>
      </Modal>

      <ModalSenha
        aberto={senhaAberta}
        aoFechar={() => setSenhaAberta(false)}
        aoDesbloquear={() => {
          gravarSessao(CHAVES.coordenacao, '1');
          setSenhaAberta(false);
          setPainelAberto(true);
        }}
      />
      {painelAberto && (
        <PainelCoordenacao
          aberto
          aoFechar={() => setPainelAberto(false)}
          reservas={reservas}
          status={agenda.status}
          ultimaSync={agenda.ultimaSync}
          pendentes={agenda.pendentes}
          mensagem={agenda.mensagem}
          endpoint={agenda.endpoint}
          sync={sync}
        />
      )}
    </div>
  );
}
