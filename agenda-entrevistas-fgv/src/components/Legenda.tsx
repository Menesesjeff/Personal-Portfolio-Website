import { ESTADOS } from '../data/grade';
import type { Estado } from '../lib/types';

const ORDEM: Estado[] = ['AC', 'AL', 'PI', 'SE', 'LIVRE'];

export function Legenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-700" aria-label="Legenda">
      {ORDEM.map((uf) => (
        <span key={uf} className="inline-flex items-center gap-1.5">
          <span className={`uf-${uf} h-4 w-6 rounded border border-black/5`} aria-hidden />
          {uf === 'LIVRE' ? 'Livre' : `${ESTADOS[uf].nome} (${uf})`}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="relative h-4 w-6 rounded bg-slate-200 ring-2 ring-fgv-ouro" aria-hidden>
          <span className="selo-check absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-black">
            ✓
          </span>
        </span>
        Selecionado
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-4 w-6 rounded bg-slate-200 ring-2 ring-emerald-500" aria-hidden />
        Já confirmado por você
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="slot-lotada h-4 w-6 rounded" aria-hidden />
        Lotada (2/2)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-4 w-6 rounded bg-slate-300 opacity-40" aria-hidden />
        Bloqueada (faixa já escolhida)
      </span>
    </div>
  );
}
