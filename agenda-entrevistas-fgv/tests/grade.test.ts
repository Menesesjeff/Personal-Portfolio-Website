import { describe, expect, it } from 'vitest';
import { CAPACIDADE_TOTAL, DIAS, FAIXAS, SLOTS, SLOT_POR_ID, TOTAL_BANCAS, descreverSlot, slotEm } from '../src/data/grade';

describe('grade de bancas', () => {
  it('tem 5 dias × 5 faixas × 4 bancas = 100 slots e 200 vagas', () => {
    expect(DIAS).toHaveLength(5);
    expect(FAIXAS).toHaveLength(5);
    expect(SLOTS).toHaveLength(100);
    expect(TOTAL_BANCAS).toBe(100);
    expect(CAPACIDADE_TOTAL).toBe(200);
  });

  it('numera de SLOT-001 a SLOT-100 sem repetição', () => {
    expect(SLOTS[0].id).toBe('SLOT-001');
    expect(SLOTS[99].id).toBe('SLOT-100');
    expect(new Set(SLOTS.map((s) => s.id)).size).toBe(100);
  });

  it('usa as faixas e dias exatos', () => {
    expect(FAIXAS.map((f) => f.label)).toEqual(['09h00-10h00', '10h10-11h10', '14h00-15h00', '15h10-16h10', '16h20-17h20']);
    expect(DIAS.map((d) => `${d.data} ${d.semana}`)).toEqual([
      '07/12 segunda', '08/12 terça', '09/12 quarta', '10/12 quinta', '11/12 sexta',
    ]);
  });

  it('D1 contém AL G1..G17 e AC G1..G3', () => {
    const d1 = SLOTS.filter((s) => s.diaId === 'D1').map((s) => s.rotulo);
    expect(d1).toEqual([...Array.from({ length: 17 }, (_, i) => `AL G${i + 1}`), 'AC G1', 'AC G2', 'AC G3']);
  });

  it('D2 contém PI G1..G20', () => {
    expect(SLOTS.filter((s) => s.diaId === 'D2').map((s) => s.rotulo)).toEqual(
      Array.from({ length: 20 }, (_, i) => `PI G${i + 1}`),
    );
  });

  it('D3–D5 contêm SE G1..G55 em sequência e 5 bancas livres no fim', () => {
    const resto = SLOTS.filter((s) => ['D3', 'D4', 'D5'].includes(s.diaId)).map((s) => s.rotulo);
    expect(resto.slice(0, 55)).toEqual(Array.from({ length: 55 }, (_, i) => `SE G${i + 1}`));
    expect(resto.slice(55)).toEqual(['Livre', 'Livre', 'Livre', 'Livre', 'Livre']);
  });

  it('posições pontuais conferem com a especificação', () => {
    expect(slotEm('D1', 'H5', 'A').rotulo).toBe('AL G17');
    expect(slotEm('D1', 'H5', 'B')).toMatchObject({ estado: 'AC', grupo: 'G1' });
    expect(slotEm('D4', 'H3', 'C').rotulo).toBe('SE G31');
    expect(slotEm('D5', 'H4', 'C').rotulo).toBe('SE G55');
    expect(slotEm('D5', 'H4', 'D')).toMatchObject({ estado: 'LIVRE', grupo: '' });
    expect(SLOT_POR_ID['SLOT-100']).toMatchObject({ diaId: 'D5', faixaId: 'H5', banca: 'D', estado: 'LIVRE' });
  });

  it('distribuição por UF: AL 17, AC 3, PI 20, SE 55, Livre 5', () => {
    const cont: Record<string, number> = {};
    SLOTS.forEach((s) => (cont[s.estado] = (cont[s.estado] ?? 0) + 1));
    expect(cont).toEqual({ AL: 17, AC: 3, PI: 20, SE: 55, LIVRE: 5 });
  });

  it('descreve slots de forma legível', () => {
    expect(descreverSlot('SLOT-001')).toBe('07/12 · 09h00-10h00 · Banca A');
    expect(descreverSlot('X')).toBe('X');
  });
});
