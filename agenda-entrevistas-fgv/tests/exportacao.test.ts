import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  COLUNAS_MATRIZ,
  COLUNAS_RESERVAS,
  formatarTimestamp,
  gerarCsv,
  linhasMatriz,
  linhasReservas,
  montarWorkbook,
  NOME_ARQUIVO_XLSX,
} from '../src/services/exportacao';
import type { Reserva } from '../src/lib/types';

const reservas: Reserva[] = [
  { id: '2', timestamp: '2026-11-20T13:00:00.000Z', slotId: 'SLOT-001', nome: 'Bruno; "Beto" Reis', email: 'b@x.com' },
  { id: '1', timestamp: '2026-11-20T12:00:00.000Z', slotId: 'SLOT-001', nome: 'Ana Lima', email: 'a@x.com' },
  { id: '3', timestamp: '2026-11-20T14:00:00.000Z', slotId: 'SLOT-100', nome: 'Caio Souza', email: 'c@x.com' },
];

describe('exportação', () => {
  it('nome do arquivo xlsx', () => {
    expect(NOME_ARQUIVO_XLSX).toBe('Agenda_Entrevistas_FGV_DGPE.xlsx');
  });

  it('formata timestamp no fuso de Brasília', () => {
    expect(formatarTimestamp('2026-11-20T12:00:00.000Z')).toBe('20/11/2026 09:00:00');
    expect(formatarTimestamp('invalido')).toBe('invalido');
  });

  it('linhas da aba Reservas têm as 10 colunas e dados derivados do slot', () => {
    const linhas = linhasReservas(reservas);
    expect(Object.keys(linhas[0])).toEqual([...COLUNAS_RESERVAS]);
    expect(linhas[0]).toMatchObject({
      SlotID: 'SLOT-001', Dia: '07/12', DiaSemana: 'segunda', Horario: '09h00-10h00',
      Banca: 'A', Estado: 'AL', Grupo: 'G1', Nome: 'Ana Lima', Email: 'a@x.com',
    });
    expect(linhas[2]).toMatchObject({ SlotID: 'SLOT-100', Estado: 'Livre', Grupo: '', Dia: '11/12' });
  });

  it('Matriz_Vagas cobre os 100 slots com ocupação, status e inscritos', () => {
    const m = linhasMatriz(reservas);
    expect(m).toHaveLength(100);
    expect(Object.keys(m[0])).toEqual([...COLUNAS_MATRIZ]);
    expect(m[0]).toMatchObject({ Ocupacao: '2/2', Status: 'Lotada', 'Inscrito 1': 'Ana Lima <a@x.com>' });
    expect(m[1]).toMatchObject({ Ocupacao: '0/2', Status: 'Disponível', 'Inscrito 1': '' });
    expect(m[99]).toMatchObject({ Ocupacao: '1/2', Status: 'Disponível', 'Inscrito 1': 'Caio Souza <c@x.com>' });
  });

  it('CSV: BOM UTF-8, separador ";" e escape de aspas', () => {
    const csv = gerarCsv(reservas);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const linhas = csv.slice(1).trim().split('\r\n');
    expect(linhas[0]).toBe(COLUNAS_RESERVAS.join(';'));
    expect(linhas).toHaveLength(4);
    expect(linhas[2]).toContain('"Bruno; ""Beto"" Reis"');
  });

  it('workbook tem as abas Reservas e Matriz_Vagas e é gravável', () => {
    const wb = montarWorkbook(XLSX, reservas);
    expect(wb.SheetNames).toEqual(['Reservas', 'Matriz_Vagas']);
    const lidas = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets.Reservas);
    expect(lidas).toHaveLength(3);
    expect(lidas[0].Nome).toBe('Ana Lima');
    expect(XLSX.utils.sheet_to_json(wb.Sheets.Matriz_Vagas)).toHaveLength(100);

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const relido = XLSX.read(buf, { type: 'array' });
    expect(relido.SheetNames).toEqual(['Reservas', 'Matriz_Vagas']);
  });

  it('workbook vazio ainda traz cabeçalhos e matriz completa', () => {
    const wb = montarWorkbook(XLSX, []);
    const cab = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.Reservas, { header: 1 })[0];
    expect(cab).toEqual([...COLUNAS_RESERVAS]);
    expect(XLSX.utils.sheet_to_json(wb.Sheets.Matriz_Vagas)).toHaveLength(100);
  });
});
