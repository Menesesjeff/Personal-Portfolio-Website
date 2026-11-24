import type { Banca, Dia, Estado, Faixa, Slot } from '../lib/types';

export const CAPACIDADE_POR_BANCA = 2;

export const DIAS: Dia[] = [
  { id: 'D1', data: '07/12', semana: 'segunda' },
  { id: 'D2', data: '08/12', semana: 'terça' },
  { id: 'D3', data: '09/12', semana: 'quarta' },
  { id: 'D4', data: '10/12', semana: 'quinta' },
  { id: 'D5', data: '11/12', semana: 'sexta' },
];

export const FAIXAS: Faixa[] = [
  { id: 'H1', label: '09h00-10h00' },
  { id: 'H2', label: '10h10-11h10' },
  { id: 'H3', label: '14h00-15h00' },
  { id: 'H4', label: '15h10-16h10' },
  { id: 'H5', label: '16h20-17h20' },
];

export const BANCAS: Banca[] = ['A', 'B', 'C', 'D'];

export const ESTADOS: Record<Estado, { nome: string; de: string; ate: string; texto: string }> = {
  AC: { nome: 'Acre', de: '#38bdf8', ate: '#0284c7', texto: '#ffffff' },
  AL: { nome: 'Alagoas', de: '#0ea5e9', ate: '#0369a1', texto: '#ffffff' },
  PI: { nome: 'Piauí', de: '#00549f', ate: '#003d7a', texto: '#ffffff' },
  SE: { nome: 'Sergipe', de: '#002b5c', ate: '#001a3a', texto: '#ffffff' },
  LIVRE: { nome: 'Livre', de: '#e2e8f0', ate: '#e2e8f0', texto: '#334155' },
};

/**
 * Grade exata: [dia][faixa] = rótulos das bancas A, B, C, D.
 */
const MATRIZ: string[][][] = [
  // D1 — 07/12 (segunda)
  [
    ['AL G1', 'AL G2', 'AL G3', 'AL G4'],
    ['AL G5', 'AL G6', 'AL G7', 'AL G8'],
    ['AL G9', 'AL G10', 'AL G11', 'AL G12'],
    ['AL G13', 'AL G14', 'AL G15', 'AL G16'],
    ['AL G17', 'AC G1', 'AC G2', 'AC G3'],
  ],
  // D2 — 08/12 (terça)
  [
    ['PI G1', 'PI G2', 'PI G3', 'PI G4'],
    ['PI G5', 'PI G6', 'PI G7', 'PI G8'],
    ['PI G9', 'PI G10', 'PI G11', 'PI G12'],
    ['PI G13', 'PI G14', 'PI G15', 'PI G16'],
    ['PI G17', 'PI G18', 'PI G19', 'PI G20'],
  ],
  // D3 — 09/12 (quarta)
  [
    ['SE G1', 'SE G2', 'SE G3', 'SE G4'],
    ['SE G5', 'SE G6', 'SE G7', 'SE G8'],
    ['SE G9', 'SE G10', 'SE G11', 'SE G12'],
    ['SE G13', 'SE G14', 'SE G15', 'SE G16'],
    ['SE G17', 'SE G18', 'SE G19', 'SE G20'],
  ],
  // D4 — 10/12 (quinta)
  [
    ['SE G21', 'SE G22', 'SE G23', 'SE G24'],
    ['SE G25', 'SE G26', 'SE G27', 'SE G28'],
    ['SE G29', 'SE G30', 'SE G31', 'SE G32'],
    ['SE G33', 'SE G34', 'SE G35', 'SE G36'],
    ['SE G37', 'SE G38', 'SE G39', 'SE G40'],
  ],
  // D5 — 11/12 (sexta)
  [
    ['SE G41', 'SE G42', 'SE G43', 'SE G44'],
    ['SE G45', 'SE G46', 'SE G47', 'SE G48'],
    ['SE G49', 'SE G50', 'SE G51', 'SE G52'],
    ['SE G53', 'SE G54', 'SE G55', 'livre'],
    ['livre', 'livre', 'livre', 'livre'],
  ],
];

function parseRotulo(rotulo: string): { estado: Estado; grupo: string; rotulo: string } {
  if (rotulo.trim().toLowerCase() === 'livre') return { estado: 'LIVRE', grupo: '', rotulo: 'Livre' };
  const [uf, grupo] = rotulo.split(' ');
  return { estado: uf as Estado, grupo, rotulo };
}

function construirSlots(): Slot[] {
  const slots: Slot[] = [];
  let n = 1;
  DIAS.forEach((dia, d) => {
    FAIXAS.forEach((faixa, f) => {
      BANCAS.forEach((banca, b) => {
        slots.push({
          id: `SLOT-${String(n++).padStart(3, '0')}`,
          diaId: dia.id,
          faixaId: faixa.id,
          banca,
          ...parseRotulo(MATRIZ[d][f][b]),
        });
      });
    });
  });
  return slots;
}

export const SLOTS: Slot[] = construirSlots();
export const SLOT_POR_ID: Record<string, Slot> = Object.fromEntries(SLOTS.map((s) => [s.id, s]));
export const DIA_POR_ID: Record<string, Dia> = Object.fromEntries(DIAS.map((d) => [d.id, d]));
export const FAIXA_POR_ID: Record<string, Faixa> = Object.fromEntries(FAIXAS.map((f) => [f.id, f]));

export const TOTAL_BANCAS = SLOTS.length; // 100
export const CAPACIDADE_TOTAL = TOTAL_BANCAS * CAPACIDADE_POR_BANCA; // 200

export function slotEm(diaId: string, faixaId: string, banca: Banca): Slot {
  return SLOTS.find((s) => s.diaId === diaId && s.faixaId === faixaId && s.banca === banca)!;
}

/** Texto curto para chips: "07/12 · 09h00-10h00 · Banca A" */
export function descreverSlot(slotId: string): string {
  const s = SLOT_POR_ID[slotId];
  if (!s) return slotId;
  return `${DIA_POR_ID[s.diaId].data} · ${FAIXA_POR_ID[s.faixaId].label} · Banca ${s.banca}`;
}
