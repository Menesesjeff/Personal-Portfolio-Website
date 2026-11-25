import { BANCAS, CAPACIDADE_POR_BANCA, CAPACIDADE_TOTAL, DIAS, FAIXAS, SLOT_POR_ID, TOTAL_BANCAS, slotEm } from '../data/grade';
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
  /** Opcional: '' ou ausente = todas as faixas */
  faixa?: string;
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
      if (f.faixa && s?.faixaId !== f.faixa) return false;
      if (termo && !semAcento(`${r.nome} ${r.email}`).includes(termo)) return false;
      return true;
    })
    .sort((a, b) => (a.slotId === b.slotId ? a.timestamp.localeCompare(b.timestamp) : a.slotId.localeCompare(b.slotId)));
}

export interface CelulaOcupacao {
  diaId: string;
  faixaId: string;
  preenchidas: number; // vagas ocupadas nas 4 bancas (máx. 8)
  capacidade: number;
  lotadas: number;
  bancas: { slotId: string; banca: string; rotulo: string; ocupacao: number }[];
}

/** Matriz [faixa][dia] com a ocupação das 4 bancas de cada faixa horária. */
export function ocupacaoPorFaixa(reservas: Reserva[]): CelulaOcupacao[][] {
  const porSlot = contarPorSlot(reservas);
  return FAIXAS.map((f) =>
    DIAS.map((d) => {
      const bancas = BANCAS.map((b) => {
        const s = slotEm(d.id, f.id, b);
        return { slotId: s.id, banca: b, rotulo: s.rotulo, ocupacao: Math.min(porSlot[s.id] ?? 0, CAPACIDADE_POR_BANCA) };
      });
      return {
        diaId: d.id,
        faixaId: f.id,
        preenchidas: bancas.reduce((n, b) => n + b.ocupacao, 0),
        capacidade: BANCAS.length * CAPACIDADE_POR_BANCA,
        lotadas: bancas.filter((b) => b.ocupacao >= CAPACIDADE_POR_BANCA).length,
        bancas,
      };
    }),
  );
}
