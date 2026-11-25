import { describe, expect, it } from 'vitest';
import { SLOT_POR_ID, slotEm } from '../src/data/grade';
import { filtrarReservas, ocupacaoPorFaixa } from '../src/lib/coordenacao';
import {
  abreviarSemana,
  alternarEstadoFiltro,
  conflitoNaFaixa,
  contarFiltrosAtivos,
  faixasVisiveis,
  FILTROS_VAZIOS,
  nivelVagas,
  slotVisivel,
  vagasLivresNoDia,
} from '../src/lib/filtros';
import type { Reserva } from '../src/lib/types';

const r = (id: string, slotId: string, email = `${id}@x.com`): Reserva => ({
  id, slotId, email, nome: `Pessoa ${id}`, timestamp: `2026-11-20T12:00:0${id}.000Z`,
});

describe('status de vagas', () => {
  it('0/2 disponível, 1/2 última vaga, 2/2 lotada', () => {
    expect(nivelVagas(0)).toBe('disponivel');
    expect(nivelVagas(1)).toBe('ultima');
    expect(nivelVagas(2)).toBe('lotada');
    expect(nivelVagas(3)).toBe('lotada');
  });
});

describe('filtros da grade', () => {
  const ocup = { 'SLOT-001': 2, 'SLOT-002': 1 };

  it('sem filtros mostra as 5 faixas × 4 bancas do dia', () => {
    const fx = faixasVisiveis('D1', FILTROS_VAZIOS, {});
    expect(fx).toHaveLength(5);
    expect(fx.every((f) => f.slots.length === 4)).toBe(true);
  });

  it('filtra por faixa horária', () => {
    const fx = faixasVisiveis('D1', { ...FILTROS_VAZIOS, faixaId: 'H3' }, {});
    expect(fx.map((f) => f.faixa.id)).toEqual(['H3']);
  });

  it('filtra por estado (AC só aparece às 16h20 de D1)', () => {
    const fx = faixasVisiveis('D1', { ...FILTROS_VAZIOS, estados: ['AC'] }, {});
    expect(fx).toHaveLength(1);
    expect(fx[0].slots.map((s) => s.rotulo)).toEqual(['AC G1', 'AC G2', 'AC G3']);
    expect(faixasVisiveis('D5', { ...FILTROS_VAZIOS, estados: ['LIVRE'] }, {}).flatMap((f) => f.slots)).toHaveLength(5);
  });

  it('"só com vaga" esconde bancas lotadas, mas mantém as escolhidas pelo participante', () => {
    const f = { ...FILTROS_VAZIOS, soComVaga: true };
    expect(slotVisivel(SLOT_POR_ID['SLOT-001'], f, ocup)).toBe(false);
    expect(slotVisivel(SLOT_POR_ID['SLOT-002'], f, ocup)).toBe(true);
    expect(slotVisivel(SLOT_POR_ID['SLOT-001'], f, ocup, new Set(['SLOT-001']))).toBe(true);
  });

  it('conta e alterna filtros', () => {
    expect(contarFiltrosAtivos(FILTROS_VAZIOS)).toBe(0);
    const f = alternarEstadoFiltro({ ...FILTROS_VAZIOS, soComVaga: true }, 'PI');
    expect(f.estados).toEqual(['PI']);
    expect(contarFiltrosAtivos(f)).toBe(2);
    expect(alternarEstadoFiltro(f, 'PI').estados).toEqual([]);
  });

  it('vagas livres por dia', () => {
    expect(vagasLivresNoDia('D1', {})).toBe(40);
    expect(vagasLivresNoDia('D1', ocup)).toBe(37);
  });

  it('abrevia dias da semana', () => {
    expect(['segunda', 'terça', 'quarta', 'quinta', 'sexta'].map(abreviarSemana)).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex']);
  });
});

describe('explicação de conflito na faixa', () => {
  const A = slotEm('D1', 'H1', 'A').id;
  const C = slotEm('D1', 'H1', 'C').id;
  it('aponta a banca escolhida ou já confirmada na mesma faixa', () => {
    expect(conflitoNaFaixa(C, [A], [])).toEqual({ banca: 'A', confirmado: false });
    expect(conflitoNaFaixa(C, [], [A])).toEqual({ banca: 'A', confirmado: true });
    expect(conflitoNaFaixa(C, [slotEm('D1', 'H2', 'A').id], [])).toBeNull();
  });
});

describe('ocupação por dia/faixa (coordenação)', () => {
  it('soma as 4 bancas de cada célula (8 vagas)', () => {
    const m = ocupacaoPorFaixa([r('1', 'SLOT-001'), r('2', 'SLOT-001'), r('3', 'SLOT-004')]);
    expect(m).toHaveLength(5);
    expect(m[0]).toHaveLength(5);
    expect(m[0][0]).toMatchObject({ diaId: 'D1', faixaId: 'H1', preenchidas: 3, capacidade: 8, lotadas: 1 });
    expect(m[0][0].bancas.map((b) => b.ocupacao)).toEqual([2, 0, 0, 1]);
    expect(m[4][4]).toMatchObject({ diaId: 'D5', faixaId: 'H5', preenchidas: 0 });
  });

  it('filtro opcional por faixa na tabela de reservas', () => {
    const lista = [r('1', 'SLOT-001'), r('2', 'SLOT-005')];
    expect(filtrarReservas(lista, { dia: '', estado: '', busca: '', faixa: 'H2' }).map((x) => x.id)).toEqual(['2']);
    expect(filtrarReservas(lista, { dia: '', estado: '', busca: '' })).toHaveLength(2);
  });
});
