import { CAPACIDADE_POR_BANCA, CAPACIDADE_TOTAL, SLOT_POR_ID, TOTAL_BANCAS } from '../data/grade';
import { contarPorSlot, normalizarEmail } from './regras';
import type { Estado, Reserva } from './types';

export interface Kpis {
  totalBancas: number;
  capacidade: number;
  reservas: number;
  lotadas: number;
  participantes: number;
  vagasLivres: number;
  percentual: number;
}

export function calcularKpis(reservas: Reserva[]): Kpis {
  const porSlot = contarPorSlot(reservas);
  const ocupadas = Object.values(porSlot).reduce((s, n) => s + Math.min(n, CAPACIDADE_POR_BANCA), 0);
  return {
    totalBancas: TOTAL_BANCAS,
    capacidade: CAPACIDADE_TOTAL,
    reservas: reservas.length,
    lotadas: Object.values(porSlot).filter((n) => n >= CAPACIDADE_POR_BANCA).length,
    participantes: new Set(reservas.map((r) => normalizarEmail(r.email))).size,
    vagasLivres: CAPACIDADE_TOTAL - ocupadas,
    percentual: Math.round((ocupadas / CAPACIDADE_TOTAL) * 100),
  };
}

export interface FiltrosReserva {
  dia: string; // '' = todos
  estado: Estado | '';
  busca: string;
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filtrarReservas(reservas: Reserva[], f: FiltrosReserva): Reserva[] {
  const termo = semAcento(f.busca.trim());
  return reservas
    .filter((r) => {
      const s = SLOT_POR_ID[r.slotId];
      if (f.dia && s?.diaId !== f.dia) return false;
      if (f.estado && s?.estado !== f.estado) return false;
      if (termo && !semAcento(`${r.nome} ${r.email}`).includes(termo)) return false;
      return true;
    })
    .sort((a, b) => (a.slotId === b.slotId ? a.timestamp.localeCompare(b.timestamp) : a.slotId.localeCompare(b.slotId)));
}
