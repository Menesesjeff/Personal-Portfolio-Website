import { Fragment, useState } from 'react';
import { BANCAS, DIAS, FAIXAS, SLOT_POR_ID, slotEm } from '../data/grade';
import type { EstadoSlot } from '../lib/regras';
import { BotaoSlot } from './BotaoSlot';

export interface PropsGrade {
  estadoDe: (slotId: string) => EstadoSlot;
  ocupacao: Record<string, number>;
  selecao: string[];
  aoAlternar: (slotId: string) => void;
}

/** Desktop (>= 768px): matriz 5 faixas × (5 dias × 4 bancas). */
export function GradeDesktop({ estadoDe, ocupacao, aoAlternar }: PropsGrade) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <table className="w-full min-w-[1080px] table-fixed border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-28" rowSpan={2}>
              <span className="sr-only">Faixa horária</span>
            </th>
            {DIAS.map((d) => (
              <th key={d.id} colSpan={4} className="rounded-lg bg-fgv-marinho px-2 py-2 text-white">
                <span className="block text-sm font-bold">{d.data}</span>
                <span className="block text-[11px] font-medium uppercase tracking-wider text-sky-200">{d.semana}</span>
              </th>
            ))}
          </tr>
          <tr>
            {DIAS.map((d) =>
              BANCAS.map((b) => (
                <th
                  key={`${d.id}${b}`}
                  className={`py-0.5 text-[11px] font-semibold text-slate-500 ${b === 'A' ? 'border-l-2 border-slate-200' : ''}`}
                  scope="col"
                >
                  {b}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {FAIXAS.map((f, i) => (
            <Fragment key={f.id}>
              {i === 2 && (
                <tr aria-hidden>
                  <td colSpan={21} className="py-1 text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                    — intervalo —
                  </td>
                </tr>
              )}
              <tr>
                <th scope="row" className="rounded-lg bg-slate-100 px-2 text-left text-xs font-bold whitespace-nowrap text-fgv-marinho">
                  {f.label}
                </th>
                {DIAS.map((d) =>
                  BANCAS.map((b) => {
                    const s = slotEm(d.id, f.id, b);
                    return (
                      <td key={s.id}>
                        <BotaoSlot slot={s} ocupacao={ocupacao[s.id] ?? 0} estado={estadoDe(s.id)} aoAlternar={aoAlternar} />
                      </td>
                    );
                  }),
                )}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mobile (< 768px): abas por dia + cartões por faixa com as 4 bancas em 2×2. */
export function GradeMobile({ estadoDe, ocupacao, selecao, aoAlternar }: PropsGrade) {
  const [diaAtivo, setDiaAtivo] = useState(DIAS[0].id);
  const diasComSelecao = new Set(selecao.map((id) => SLOT_POR_ID[id]?.diaId));

  return (
    <div>
      <div
        role="tablist"
        aria-label="Dias"
        className="sem-barra sticky top-0 z-20 -mx-4 flex gap-2 overflow-x-auto bg-fundo/95 px-4 py-2 backdrop-blur"
      >
        {DIAS.map((d) => {
          const ativo = d.id === diaAtivo;
          return (
            <button
              key={d.id}
              role="tab"
              type="button"
              aria-selected={ativo}
              onClick={() => setDiaAtivo(d.id)}
              className={`relative min-w-[64px] flex-1 rounded-xl px-2 py-2 text-center transition ${
                ativo ? 'bg-fgv-marinho text-white shadow-md' : 'bg-white text-slate-700 ring-1 ring-slate-200'
              }`}
            >
              <span className="block text-sm font-bold">{d.data}</span>
              <span className={`block text-[10px] uppercase tracking-wide ${ativo ? 'text-sky-200' : 'text-slate-500'}`}>
                {d.semana}
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

      <div role="tabpanel" className="mt-2 space-y-3">
        {FAIXAS.map((f) => (
          <article key={f.id} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-fgv-marinho">
              <span aria-hidden>🕘</span> {f.label}
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {BANCAS.map((b) => {
                const s = slotEm(diaAtivo, f.id, b);
                return (
                  <BotaoSlot
                    key={s.id}
                    slot={s}
                    ocupacao={ocupacao[s.id] ?? 0}
                    estado={estadoDe(s.id)}
                    aoAlternar={aoAlternar}
                    grande
                  />
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
