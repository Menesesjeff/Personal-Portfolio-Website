import { describe, expect, it } from 'vitest';
import { calcularKpis, filtrarReservas } from '../src/lib/coordenacao';
import type { Reserva } from '../src/lib/types';

const r = (id: string, slotId: string, nome: string, email: string): Reserva => ({
  id, slotId, nome, email, timestamp: `2026-11-20T12:00:0${id}.000Z`,
});
const reservas = [
  r('1', 'SLOT-001', 'Ana Lima', 'ana@x.com'),
  r('2', 'SLOT-001', 'Bruno Reis', 'bruno@x.com'),
  r('3', 'SLOT-021', 'João Araújo', 'joao@x.com'), // D2 PI
  r('4', 'SLOT-100', 'Ana Lima', 'ANA@x.com'), // D5 livre
];

describe('KPIs da coordenação', () => {
  it('calcula totais, lotadas e participantes únicos', () => {
    expect(calcularKpis(reservas)).toEqual({
      totalBancas: 100, capacidade: 200, reservas: 4, lotadas: 1, participantes: 3, vagasLivres: 196, percentual: 2,
    });
  });
});

describe('filtros da tabela', () => {
  it('por dia', () => {
    expect(filtrarReservas(reservas, { dia: 'D2', estado: '', busca: '' }).map((x) => x.id)).toEqual(['3']);
  });
  it('por estado', () => {
    expect(filtrarReservas(reservas, { dia: '', estado: 'AL', busca: '' }).map((x) => x.id)).toEqual(['1', '2']);
    expect(filtrarReservas(reservas, { dia: '', estado: 'LIVRE', busca: '' }).map((x) => x.id)).toEqual(['4']);
  });
  it('busca por nome sem acento/maiúsculas', () => {
    expect(filtrarReservas(reservas, { dia: '', estado: '', busca: 'joao ARAUJO' }).map((x) => x.id)).toEqual(['3']);
    expect(filtrarReservas(reservas, { dia: '', estado: '', busca: 'ana' }).map((x) => x.id)).toEqual(['1', '4']);
  });
});
