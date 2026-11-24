import { memo } from 'react';
import { CAPACIDADE_POR_BANCA, DIA_POR_ID, FAIXA_POR_ID } from '../data/grade';
import { MENSAGEM_MOTIVO, type EstadoSlot } from '../lib/regras';
import type { Slot } from '../lib/types';

interface Props {
  slot: Slot;
  ocupacao: number;
  estado: EstadoSlot;
  aoAlternar: (slotId: string) => void;
  grande?: boolean;
}

export const BotaoSlot = memo(function BotaoSlot({ slot, ocupacao, estado, aoAlternar, grande }: Props) {
  const lotada = estado.tipo === 'bloqueado' && estado.motivo === 'lotada';
  const faixaBloqueada = estado.tipo === 'bloqueado' && estado.motivo === 'faixa-ocupada';
  const selecionado = estado.tipo === 'selecionado';
  const reservado = estado.tipo === 'reservado';
  const desabilitado = estado.tipo === 'bloqueado' || reservado;

  const vagas = Math.min(ocupacao, CAPACIDADE_POR_BANCA);
  const descricao = `${DIA_POR_ID[slot.diaId].data} ${FAIXA_POR_ID[slot.faixaId].label}, Banca ${slot.banca}, ${slot.rotulo}, ocupação ${vagas} de ${CAPACIDADE_POR_BANCA}`;
  const status = selecionado
    ? 'selecionado'
    : reservado
      ? 'já confirmado por você'
      : estado.tipo === 'bloqueado'
        ? MENSAGEM_MOTIVO[estado.motivo]
        : 'disponível';

  return (
    <button
      type="button"
      onClick={() => aoAlternar(slot.id)}
      disabled={desabilitado}
      aria-pressed={selecionado}
      aria-label={`${descricao} — ${status}`}
      title={`${slot.id} · ${status}`}
      data-slot={slot.id}
      className={[
        `uf-${slot.estado}`,
        'relative flex w-full flex-col items-center justify-center rounded-lg text-center leading-tight transition',
        grande ? 'min-h-[68px] px-2 py-2' : 'min-h-[52px] px-1 py-1.5',
        lotada ? 'slot-lotada cursor-not-allowed' : '',
        faixaBloqueada ? 'cursor-not-allowed opacity-35 saturate-50' : '',
        selecionado ? 'z-10 scale-[1.03] shadow-lg ring-[3px] ring-fgv-ouro ring-offset-1' : '',
        reservado ? 'cursor-default ring-[3px] ring-emerald-500 ring-offset-1' : '',
        !desabilitado && !selecionado ? 'hover:-translate-y-0.5 hover:shadow-md active:scale-95' : '',
      ].join(' ')}
    >
      {grande && <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Banca {slot.banca}</span>}
      <span className={`font-bold whitespace-nowrap ${grande ? 'text-sm' : 'text-[11px] tracking-tight'}`}>{slot.rotulo}</span>
      <span className={`font-medium opacity-85 ${grande ? 'text-xs' : 'text-[10px]'}`}>
        {lotada ? 'Lotada' : faixaBloqueada ? '🔒' : reservado ? 'Confirmado' : `${vagas}/${CAPACIDADE_POR_BANCA}`}
      </span>
      {(selecionado || reservado) && (
        <span
          className={`absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black ${
            reservado ? 'bg-emerald-500 text-white shadow' : 'selo-check'
          }`}
          aria-hidden
        >
          ✓
        </span>
      )}
    </button>
  );
});
