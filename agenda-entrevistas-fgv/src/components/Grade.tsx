import { Fragment } from 'react';
import { BANCAS, DIAS, FAIXAS, slotEm } from '../data/grade';
import type { EstadoSlot } from '../lib/regras';
import { BotaoSlot } from './BotaoSlot';

export interface PropsGrade {
  estadoDe: (slotId: string) => EstadoSlot;
  ocupacao: Record<string, number>;
  selecao?: string[];
  aoAlternar: (slotId: string) => void;
}

/** Visão "Semana inteira" (desktop): matriz 5 faixas × (5 dias × 4 bancas). */
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
