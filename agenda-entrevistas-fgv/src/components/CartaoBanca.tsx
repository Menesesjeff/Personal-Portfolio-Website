import { memo } from 'react';
import { CAPACIDADE_POR_BANCA, DIA_POR_ID, FAIXA_POR_ID } from '../data/grade';
import { nivelVagas, type Conflito } from '../lib/filtros';
import { MENSAGEM_MOTIVO, type EstadoSlot } from '../lib/regras';
import type { Slot } from '../lib/types';

export type TomBadge = 'disponivel' | 'ultima' | 'lotada' | 'selecionada' | 'confirmada' | 'conflito';

const ESTILO_BADGE: Record<TomBadge, string> = {
  disponivel: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  ultima: 'bg-amber-50 text-amber-800 ring-amber-300',
  lotada: 'bg-red-50 text-red-700 ring-red-200',
  selecionada: 'bg-yellow-100 text-yellow-900 ring-yellow-400',
  confirmada: 'bg-emerald-600 text-white ring-emerald-600',
  conflito: 'bg-slate-100 text-slate-600 ring-slate-300',
};

const PONTO_BADGE: Record<TomBadge, string> = {
  disponivel: 'bg-emerald-500',
  ultima: 'bg-amber-500',
  lotada: 'bg-red-500',
  selecionada: 'bg-yellow-500',
  confirmada: 'bg-white',
  conflito: 'bg-slate-400',
};

export function BadgeStatus({ tom, children }: { tom: TomBadge; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ${ESTILO_BADGE[tom]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${PONTO_BADGE[tom]}`} aria-hidden />
      {children}
    </span>
  );
}

/** Dois pontos que representam as 2 vagas da banca. */
function PontosVagas({ ocupacao }: { ocupacao: number }) {
  return (
    <span className="hidden items-center gap-1 sm:flex" aria-hidden>
      {Array.from({ length: CAPACIDADE_POR_BANCA }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ring-1 ${i < ocupacao ? 'bg-fgv-marinho ring-fgv-marinho' : 'bg-white ring-slate-300'}`}
        />
      ))}
    </span>
  );
}

interface Props {
  slot: Slot;
  ocupacao: number;
  estado: EstadoSlot;
  conflito: Conflito | null;
  aoAlternar: (slotId: string) => void;
}

/** Cartão de uma banca (A–D) na visão por dia. */
export const CartaoBanca = memo(function CartaoBanca({ slot, ocupacao, estado, conflito, aoAlternar }: Props) {
  const vagas = Math.min(ocupacao, CAPACIDADE_POR_BANCA);
  const selecionado = estado.tipo === 'selecionado';
  const reservado = estado.tipo === 'reservado';
  const lotada = estado.tipo === 'bloqueado' && estado.motivo === 'lotada';
  const emConflito = estado.tipo === 'bloqueado' && estado.motivo === 'faixa-ocupada';
  const desabilitado = estado.tipo === 'bloqueado' || reservado;

  let tom: TomBadge;
  let rotuloBadge: string;
  if (selecionado) [tom, rotuloBadge] = ['selecionada', '✓ Selecionada'];
  else if (reservado) [tom, rotuloBadge] = ['confirmada', '✓ Confirmada'];
  else if (emConflito) [tom, rotuloBadge] = ['conflito', 'Conflito'];
  else {
    const nivel = nivelVagas(vagas);
    tom = nivel;
    rotuloBadge = nivel === 'lotada' ? 'Lotada' : nivel === 'ultima' ? 'Última vaga' : `${CAPACIDADE_POR_BANCA - vagas} vagas`;
  }

  const descricao = `${DIA_POR_ID[slot.diaId].data} ${FAIXA_POR_ID[slot.faixaId].label}, Banca ${slot.banca}, ${slot.rotulo}, ocupação ${vagas} de ${CAPACIDADE_POR_BANCA}`;
  const status = selecionado
    ? 'selecionado'
    : reservado
      ? 'já confirmado por você'
      : estado.tipo === 'bloqueado'
        ? MENSAGEM_MOTIVO[estado.motivo]
        : 'disponível';
  const dica = conflito
    ? conflito.confirmado
      ? `Você já confirmou a Banca ${conflito.banca} neste horário`
      : `Você já escolheu a Banca ${conflito.banca} neste horário`
    : null;

  return (
    <button
      type="button"
      onClick={() => aoAlternar(slot.id)}
      disabled={desabilitado}
      aria-pressed={selecionado}
      aria-label={`${descricao} — ${status}${dica ? ` (${dica})` : ''}`}
      title={dica ?? `${slot.id} · ${status}`}
      data-slot={slot.id}
      className={[
        'relative flex w-full flex-col overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 transition',
        selecionado ? 'z-10 shadow-lg ring-[3px] ring-fgv-ouro' : reservado ? 'ring-2 ring-emerald-500' : 'ring-slate-200',
        lotada ? 'cursor-not-allowed bg-slate-50' : '',
        emConflito ? 'cursor-not-allowed opacity-60' : '',
        !desabilitado && !selecionado ? 'hover:-translate-y-0.5 hover:shadow-md hover:ring-fgv-azul/40 active:scale-[0.98]' : '',
      ].join(' ')}
    >
      <span
        className={`uf-${slot.estado} flex items-center justify-between gap-2 px-3 py-2 ${
          lotada ? 'grayscale-[70%] opacity-70' : emConflito ? 'saturate-50' : ''
        }`}
      >
        <span className="text-base leading-none font-extrabold tracking-tight">{slot.rotulo}</span>
        <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-bold tracking-wide uppercase">
          Banca {slot.banca}
        </span>
      </span>
      <span className="flex items-center justify-between gap-1.5 px-2.5 py-2 sm:px-3">
        <BadgeStatus tom={tom}>{rotuloBadge}</BadgeStatus>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          {vagas}/{CAPACIDADE_POR_BANCA}
          <PontosVagas ocupacao={vagas} />
        </span>
      </span>
    </button>
  );
});
