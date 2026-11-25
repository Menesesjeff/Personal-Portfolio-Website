import { DIA_POR_ID, DIAS, FAIXA_POR_ID, SLOT_POR_ID, descreverSlot } from '../data/grade';
import { abreviarSemana } from '../lib/filtros';
import type { Reserva } from '../lib/types';

function agruparPorDia(ids: string[]): { diaId: string; ids: string[] }[] {
  return DIAS.map((d) => ({
    diaId: d.id,
    ids: ids.filter((id) => SLOT_POR_ID[id]?.diaId === d.id).sort(),
  })).filter((g) => g.ids.length > 0);
}

/** Barra lateral (desktop) com o resumo da seleção e os horários já confirmados. */
export function ResumoSelecao({
  selecao,
  confirmadas,
  aoRemover,
  aoLimpar,
  aoConfirmar,
  enviando,
}: {
  selecao: string[];
  confirmadas: Reserva[];
  aoRemover: (slotId: string) => void;
  aoLimpar: () => void;
  aoConfirmar: () => void;
  enviando: boolean;
}) {
  const n = selecao.length;
  const grupos = agruparPorDia(selecao);
  const gruposConf = agruparPorDia(confirmadas.map((r) => r.slotId));
  const pendentes = new Set(confirmadas.filter((r) => r.pendente).map((r) => r.slotId));

  return (
    <aside className="sticky top-4 space-y-4" aria-label="Resumo da seleção">
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <header className="flex items-center justify-between bg-fgv-marinho px-4 py-3 text-white">
          <h2 className="text-sm font-bold">Sua seleção</h2>
          <span className="rounded-full bg-fgv-ouro px-2.5 py-0.5 text-sm font-extrabold text-fgv-escuro tabular-nums">{n}</span>
        </header>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto px-4 py-3">
          {n === 0 ? (
            <p className="py-4 text-center text-xs leading-relaxed text-slate-500">
              Nenhum horário selecionado.
              <br />
              Clique nas bancas para escolher.
            </p>
          ) : (
            grupos.map((g) => (
              <div key={g.diaId}>
                <p className="mb-1 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                  {DIA_POR_ID[g.diaId].data} · {abreviarSemana(DIA_POR_ID[g.diaId].semana)}
                </p>
                <ul className="space-y-1">
                  {g.ids.map((id) => {
                    const s = SLOT_POR_ID[id];
                    return (
                      <li key={id} className="flex items-center gap-2 rounded-lg bg-slate-50 py-1.5 pr-1 pl-2 text-xs ring-1 ring-slate-200">
                        <span className={`uf-${s.estado} rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap`}>{s.rotulo}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-700">
                          {FAIXA_POR_ID[s.faixaId].label} · Banca {s.banca}
                        </span>
                        <button
                          type="button"
                          onClick={() => aoRemover(id)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remover ${descreverSlot(id)}`}
                        >
                          ✕
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
        <footer className="space-y-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={aoConfirmar}
            disabled={n === 0 || enviando}
            className="w-full rounded-lg bg-fgv-marinho px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-fgv-azul disabled:opacity-40"
          >
            {enviando ? 'Enviando…' : `Confirmar Seleção (${n})`}
          </button>
          <button
            type="button"
            onClick={aoLimpar}
            disabled={n === 0 || enviando}
            className="w-full rounded-lg px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            Limpar
          </button>
        </footer>
      </section>

      {confirmadas.length > 0 && (
        <section className="rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
          <h2 className="mb-2 flex items-center justify-between text-sm font-bold text-emerald-900">
            Confirmados <span className="tabular-nums">{confirmadas.length}</span>
          </h2>
          <div className="space-y-2">
            {gruposConf.map((g) => (
              <div key={g.diaId}>
                <p className="text-[11px] font-bold tracking-wide text-emerald-800/80 uppercase">
                  {DIA_POR_ID[g.diaId].data} · {abreviarSemana(DIA_POR_ID[g.diaId].semana)}
                </p>
                <ul className="mt-0.5 space-y-0.5 text-xs text-emerald-900">
                  {g.ids.map((id) => (
                    <li key={id}>
                      ✓ {FAIXA_POR_ID[SLOT_POR_ID[id].faixaId].label} · Banca {SLOT_POR_ID[id].banca} · {SLOT_POR_ID[id].rotulo}
                      {pendentes.has(id) && <span className="ml-1 text-amber-700">(aguardando envio)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-emerald-800">Para cancelar, fale com a coordenação.</p>
        </section>
      )}
    </aside>
  );
}
