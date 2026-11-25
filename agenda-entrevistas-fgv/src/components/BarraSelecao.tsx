import { descreverSlot, SLOT_POR_ID } from '../data/grade';

/** Barra fixa inferior (mobile/PWA): chips removíveis + Limpar + Confirmar. */
export function BarraSelecao({
  selecao,
  aoRemover,
  aoLimpar,
  aoConfirmar,
  enviando,
}: {
  selecao: string[];
  aoRemover: (slotId: string) => void;
  aoLimpar: () => void;
  aoConfirmar: () => void;
  enviando: boolean;
}) {
  const n = selecao.length;
  const dias = new Set(selecao.map((id) => SLOT_POR_ID[id]?.diaId)).size;
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-4px_20px_rgb(0_0_0/0.08)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 pt-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-fgv-marinho">
            Sua seleção{' '}
            <span className="ml-1 rounded-full bg-fgv-ouro px-2 py-0.5 text-[11px] font-extrabold text-fgv-escuro tabular-nums">{n}</span>
          </span>
          {n > 0 && (
            <span className="text-slate-500">
              {n} horário(s) em {dias} dia(s)
            </span>
          )}
        </div>
        <div className="sem-barra -my-1 flex min-h-[40px] min-w-0 items-center gap-2 overflow-x-auto px-1 py-1">
          {n === 0 ? (
            <span className="text-xs text-slate-500">Toque nas bancas para selecionar seus horários.</span>
          ) : (
            selecao.map((id) => (
              <span
                key={id}
                className={`uf-${SLOT_POR_ID[id]?.estado ?? 'LIVRE'} inline-flex shrink-0 items-center gap-1 rounded-full py-1 pr-1 pl-3 text-xs font-semibold whitespace-nowrap ring-2 ring-fgv-ouro`}
              >
                {descreverSlot(id)} · {SLOT_POR_ID[id]?.rotulo}
                <button
                  type="button"
                  onClick={() => aoRemover(id)}
                  className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/20 text-[10px] hover:bg-black/40"
                  aria-label={`Remover ${descreverSlot(id)}`}
                >
                  ✕
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={aoLimpar}
            disabled={n === 0 || enviando}
            className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={aoConfirmar}
            disabled={n === 0 || enviando}
            className="flex-1 rounded-lg bg-fgv-marinho px-5 py-3 text-sm font-bold text-white shadow hover:bg-fgv-azul disabled:opacity-40"
          >
            {enviando ? 'Enviando…' : `Confirmar Seleção (${n})`}
          </button>
        </div>
      </div>
    </div>
  );
}
