import { useMemo } from 'react';
import { DIAS, ESTADOS, FAIXAS, SLOT_POR_ID } from '../data/grade';
import {
  abreviarSemana,
  alternarEstadoFiltro,
  conflitoNaFaixa,
  contarFiltrosAtivos,
  faixasVisiveis,
  FILTROS_VAZIOS,
  vagasLivresNoDia,
  type FiltrosGrade,
} from '../lib/filtros';
import type { EstadoSlot } from '../lib/regras';
import type { Estado } from '../lib/types';
import { CartaoBanca } from './CartaoBanca';

const UFS: Estado[] = ['AL', 'AC', 'PI', 'SE', 'LIVRE'];

// ---------------------------------------------------------------------------
// Abas de dias
// ---------------------------------------------------------------------------
export function SeletorDias({
  diaAtivo,
  aoTrocar,
  selecao,
  ocupacao,
}: {
  diaAtivo: string;
  aoTrocar: (diaId: string) => void;
  selecao: string[];
  ocupacao: Record<string, number>;
}) {
  const diasComSelecao = new Set(selecao.map((id) => SLOT_POR_ID[id]?.diaId));
  return (
    <div role="tablist" aria-label="Dias" className="sem-barra flex gap-2 overflow-x-auto px-0.5 py-1">
      {DIAS.map((d) => {
        const ativo = d.id === diaAtivo;
        const livres = vagasLivresNoDia(d.id, ocupacao);
        return (
          <button
            key={d.id}
            role="tab"
            type="button"
            aria-selected={ativo}
            onClick={() => aoTrocar(d.id)}
            className={`relative min-w-[62px] flex-1 rounded-xl px-1.5 py-1.5 text-center transition sm:px-2 sm:py-2 ${
              ativo
                ? 'bg-fgv-marinho text-white shadow-md'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300'
            }`}
          >
            <span className="block text-sm leading-tight font-bold">
              {d.data}{' '}
              <span className={`block text-[11px] sm:inline sm:text-sm ${ativo ? 'text-sky-200' : 'text-slate-500'}`}>
                {abreviarSemana(d.semana)}
              </span>
            </span>
            <span
              className={`mt-0.5 block text-[10px] font-medium ${
                ativo ? 'text-sky-100' : livres === 0 ? 'text-red-600' : 'text-slate-500'
              }`}
            >
              {livres === 0 ? 'sem vagas' : `${livres} vagas`}
            </span>
            {diasComSelecao.has(d.id) && (
              <span
                className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-fgv-ouro ring-2 ring-white"
                aria-label="há seleção neste dia"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filtros rápidos
// ---------------------------------------------------------------------------
function Chip({ ativo, onClick, children, titulo }: { ativo: boolean; onClick: () => void; children: React.ReactNode; titulo?: string }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      title={titulo}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
        ativo ? 'bg-fgv-marinho text-white shadow-sm' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

export function BarraFiltros({ filtros, aoMudar }: { filtros: FiltrosGrade; aoMudar: (f: FiltrosGrade) => void }) {
  const ativos = contarFiltrosAtivos(filtros);
  return (
    <div className="space-y-2" aria-label="Filtros da grade">
      <div className="sem-barra -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 py-0.5">
        <span className="mr-1 shrink-0 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Horário</span>
        <Chip ativo={!filtros.faixaId} onClick={() => aoMudar({ ...filtros, faixaId: '' })}>
          Todos
        </Chip>
        {FAIXAS.map((f) => (
          <Chip
            key={f.id}
            ativo={filtros.faixaId === f.id}
            onClick={() => aoMudar({ ...filtros, faixaId: filtros.faixaId === f.id ? '' : f.id })}
          >
            {f.label.split('-')[0]}
          </Chip>
        ))}
      </div>
      <div className="sem-barra -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 py-0.5">
        <span className="mr-1 shrink-0 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Grupo</span>
        {UFS.map((uf) => (
          <Chip
            key={uf}
            ativo={filtros.estados.includes(uf)}
            onClick={() => aoMudar(alternarEstadoFiltro(filtros, uf))}
            titulo={ESTADOS[uf].nome}
          >
            <span className={`uf-${uf} mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle ring-1 ring-black/10`} aria-hidden />
            {uf === 'LIVRE' ? 'Livre' : uf}
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-slate-300" aria-hidden />
        <Chip ativo={filtros.soComVaga} onClick={() => aoMudar({ ...filtros, soComVaga: !filtros.soComVaga })}>
          Só com vaga
        </Chip>
        {ativos > 0 && (
          <button
            type="button"
            onClick={() => aoMudar(FILTROS_VAZIOS)}
            className="shrink-0 px-2 text-xs font-semibold text-fgv-azul underline-offset-2 hover:underline"
          >
            Limpar filtros ({ativos})
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grade do dia (cartões por faixa)
// ---------------------------------------------------------------------------
export interface PropsGradeDia {
  diaAtivo: string;
  filtros: FiltrosGrade;
  estadoDe: (slotId: string) => EstadoSlot;
  ocupacao: Record<string, number>;
  selecao: string[];
  confirmados: string[];
  aoAlternar: (slotId: string) => void;
  aoLimparFiltros: () => void;
}

export function GradeDia({
  diaAtivo,
  filtros,
  estadoDe,
  ocupacao,
  selecao,
  confirmados,
  aoAlternar,
  aoLimparFiltros,
}: PropsGradeDia) {
  const manter = useMemo(() => new Set([...selecao, ...confirmados]), [selecao, confirmados]);
  const faixas = faixasVisiveis(diaAtivo, filtros, ocupacao, manter);

  if (faixas.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-semibold text-slate-700">Nenhuma banca corresponde aos filtros neste dia.</p>
        <button
          type="button"
          onClick={aoLimparFiltros}
          className="mt-3 rounded-lg bg-fgv-marinho px-4 py-2 text-sm font-semibold text-white"
        >
          Limpar filtros
        </button>
      </div>
    );
  }

  return (
    <div role="tabpanel" className="space-y-3">
      {faixas.map(({ faixa, slots }, i) => {
        const anterior = faixas[i - 1]?.faixa;
        const mostrarIntervalo = anterior && FAIXAS.indexOf(anterior) < 2 && FAIXAS.indexOf(faixa) >= 2;
        const escolhida = slots.find((s) => selecao.includes(s.id) || confirmados.includes(s.id));
        return (
          <div key={faixa.id}>
            {mostrarIntervalo && (
              <p className="py-1 text-center text-[10px] font-semibold tracking-[0.3em] text-slate-400 uppercase" aria-hidden>
                — intervalo —
              </p>
            )}
            <article className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 sm:p-4">
              <header className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-fgv-marinho">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 tabular-nums">{faixa.label}</span>
                </h3>
                {escolhida ? (
                  <span className="text-[11px] font-semibold text-emerald-700">
                    ✓ Banca {escolhida.banca} {confirmados.includes(escolhida.id) ? 'confirmada' : 'escolhida'} — as demais ficam bloqueadas
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500">Escolha 1 banca</span>
                )}
              </header>
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {slots.map((s) => {
                  const estado = estadoDe(s.id);
                  return (
                    <CartaoBanca
                      key={s.id}
                      slot={s}
                      ocupacao={ocupacao[s.id] ?? 0}
                      estado={estado}
                      conflito={
                        estado.tipo === 'bloqueado' && estado.motivo === 'faixa-ocupada'
                          ? conflitoNaFaixa(s.id, selecao, confirmados)
                          : null
                      }
                      aoAlternar={aoAlternar}
                    />
                  );
                })}
              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
}
