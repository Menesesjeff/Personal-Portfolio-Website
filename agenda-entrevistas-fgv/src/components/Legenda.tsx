import { ESTADOS } from '../data/grade';
import type { Estado } from '../lib/types';
import { BadgeStatus } from './CartaoBanca';

const ORDEM: Estado[] = ['AC', 'AL', 'PI', 'SE', 'LIVRE'];

export function Legenda() {
  return (
    <details className="group rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200 open:pb-3">
      <summary className="cursor-pointer list-none text-xs font-semibold text-slate-600 select-none">
        <span className="mr-1 inline-block transition group-open:rotate-90" aria-hidden>
          ▸
        </span>
        Legenda de cores e status
      </summary>
      <div className="mt-2 space-y-2" aria-label="Legenda">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-700">
          {ORDEM.map((uf) => (
            <span key={uf} className="inline-flex items-center gap-1.5">
              <span className={`uf-${uf} h-3.5 w-6 rounded border border-black/5`} aria-hidden />
              {uf === 'LIVRE' ? 'Livre' : `${ESTADOS[uf].nome} (${uf})`}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <BadgeStatus tom="disponivel">2 vagas (0/2)</BadgeStatus>
          <BadgeStatus tom="ultima">Última vaga (1/2)</BadgeStatus>
          <BadgeStatus tom="lotada">Lotada (2/2)</BadgeStatus>
          <BadgeStatus tom="selecionada">✓ Selecionada</BadgeStatus>
          <BadgeStatus tom="confirmada">✓ Confirmada</BadgeStatus>
          <BadgeStatus tom="conflito">Conflito (já há banca nesse horário)</BadgeStatus>
        </div>
      </div>
    </details>
  );
}
