import type { WorkBook } from 'xlsx';
import {
  CAPACIDADE_POR_BANCA,
  DIA_POR_ID,
  ESTADOS,
  FAIXA_POR_ID,
  SLOTS,
  SLOT_POR_ID,
} from '../data/grade';
import {
  COLUNAS_AVALIACOES,
  CRITERIOS,
  PONTUACAO_MAXIMA,
  rotuloStatus,
  type Avaliacao,
  type LinhaRanking,
} from '../lib/avaliacao';
import type { Reserva } from '../lib/types';

export const NOME_ARQUIVO_XLSX = 'Agenda_Entrevistas_FGV_DGPE.xlsx';
export const NOME_ARQUIVO_CSV = 'Agenda_Entrevistas_FGV_DGPE.csv';
export const NOME_ARQUIVO_RESULTADOS = 'Resultados_Ranking_FGV_DGPE.xlsx';

export const COLUNAS_RESERVAS = [
  'Timestamp',
  'SlotID',
  'Dia',
  'DiaSemana',
  'Horario',
  'Banca',
  'Estado',
  'Grupo',
  'Nome',
  'Email',
] as const;

export const COLUNAS_MATRIZ = [
  'SlotID',
  'Dia',
  'DiaSemana',
  'Horario',
  'Banca',
  'Estado',
  'Grupo',
  'Ocupacao',
  'Status',
  'Inscrito 1',
  'Inscrito 2',
] as const;

export type LinhaReserva = Record<(typeof COLUNAS_RESERVAS)[number], string>;
export type LinhaMatriz = Record<(typeof COLUNAS_MATRIZ)[number], string>;

/** Formata ISO → "dd/mm/aaaa hh:mm:ss" (horário de Brasília). */
export function formatarTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(',', '');
}

function ordenar(reservas: Reserva[]): Reserva[] {
  return [...reservas].sort((a, b) =>
    a.slotId === b.slotId ? a.timestamp.localeCompare(b.timestamp) : a.slotId.localeCompare(b.slotId),
  );
}

export function linhasReservas(reservas: Reserva[]): LinhaReserva[] {
  return ordenar(reservas).map((r) => {
    const s = SLOT_POR_ID[r.slotId];
    const dia = s ? DIA_POR_ID[s.diaId] : undefined;
    return {
      Timestamp: formatarTimestamp(r.timestamp),
      SlotID: r.slotId,
      Dia: dia?.data ?? '',
      DiaSemana: dia?.semana ?? '',
      Horario: s ? FAIXA_POR_ID[s.faixaId].label : '',
      Banca: s?.banca ?? '',
      Estado: s ? (s.estado === 'LIVRE' ? 'Livre' : s.estado) : '',
      Grupo: s?.grupo ?? '',
      Nome: r.nome,
      Email: r.email,
    };
  });
}

export function linhasMatriz(reservas: Reserva[]): LinhaMatriz[] {
  const porSlot = new Map<string, Reserva[]>();
  for (const r of ordenar(reservas)) {
    const lista = porSlot.get(r.slotId) ?? [];
    lista.push(r);
    porSlot.set(r.slotId, lista);
  }
  return SLOTS.map((s) => {
    const inscritos = porSlot.get(s.id) ?? [];
    const n = Math.min(inscritos.length, CAPACIDADE_POR_BANCA);
    return {
      SlotID: s.id,
      Dia: DIA_POR_ID[s.diaId].data,
      DiaSemana: DIA_POR_ID[s.diaId].semana,
      Horario: FAIXA_POR_ID[s.faixaId].label,
      Banca: s.banca,
      Estado: s.estado === 'LIVRE' ? 'Livre' : `${s.estado} (${ESTADOS[s.estado].nome})`,
      Grupo: s.grupo,
      Ocupacao: `${n}/${CAPACIDADE_POR_BANCA}`,
      Status: inscritos.length >= CAPACIDADE_POR_BANCA ? 'Lotada' : 'Disponível',
      'Inscrito 1': inscritos[0] ? `${inscritos[0].nome} <${inscritos[0].email}>` : '',
      'Inscrito 2': inscritos[1] ? `${inscritos[1].nome} <${inscritos[1].email}>` : '',
    };
  });
}

// ---------------------------------------------------------------------------
// CSV (UTF-8 com BOM, separador ";")
// ---------------------------------------------------------------------------

function celulaCsv(v: string): string {
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function gerarCsv(reservas: Reserva[]): string {
  const linhas = linhasReservas(reservas);
  const corpo = [
    COLUNAS_RESERVAS.join(';'),
    ...linhas.map((l) => COLUNAS_RESERVAS.map((c) => celulaCsv(l[c])).join(';')),
  ].join('\r\n');
  return `﻿${corpo}\r\n`;
}

// ---------------------------------------------------------------------------
// XLSX (SheetJS) — 2 abas: Reservas e Matriz_Vagas
// ---------------------------------------------------------------------------

type XLSXModule = typeof import('xlsx');

export function montarWorkbook(XLSX: XLSXModule, reservas: Reserva[]): WorkBook {
  const wb = XLSX.utils.book_new();

  const wsReservas = XLSX.utils.json_to_sheet(linhasReservas(reservas), {
    header: [...COLUNAS_RESERVAS],
  });
  wsReservas['!cols'] = [20, 10, 8, 10, 14, 7, 8, 7, 32, 34].map((wch) => ({ wch }));
  wsReservas['!autofilter'] = { ref: `A1:J${Math.max(reservas.length + 1, 1)}` };
  XLSX.utils.book_append_sheet(wb, wsReservas, 'Reservas');

  const wsMatriz = XLSX.utils.json_to_sheet(linhasMatriz(reservas), { header: [...COLUNAS_MATRIZ] });
  wsMatriz['!cols'] = [10, 8, 10, 14, 7, 14, 7, 10, 11, 44, 44].map((wch) => ({ wch }));
  wsMatriz['!autofilter'] = { ref: `A1:K${SLOTS.length + 1}` };
  XLSX.utils.book_append_sheet(wb, wsMatriz, 'Matriz_Vagas');

  wb.Props = { Title: 'Agenda das Bancas — FGV DGPE', Author: 'FGV DGPE' };
  return wb;
}

function baixarBlob(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function baixarXlsx(reservas: Reserva[]): Promise<void> {
  const XLSX = await import('xlsx'); // carregado sob demanda (mantém o app leve)
  const wb = montarWorkbook(XLSX, reservas);
  const dados = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  baixarBlob(
    new Blob([dados], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    NOME_ARQUIVO_XLSX,
  );
}

export function baixarCsv(reservas: Reserva[]): void {
  baixarBlob(new Blob([gerarCsv(reservas)], { type: 'text/csv;charset=utf-8' }), NOME_ARQUIVO_CSV);
}

// ---------------------------------------------------------------------------
// Resultados & Ranking — 2 abas: Ranking_Consolidado e Avaliacoes_Detalhadas
// ---------------------------------------------------------------------------

export const COLUNAS_RANKING = [
  'Posicao',
  'UF',
  'Grupo',
  'Candidato',
  'EmailCandidato',
  'Status',
  'Presente',
  'TotalPontos',
  'ChaveVideo',
  'Apto',
  'AvaliadorNome',
  'AvaliadorEmail',
  'AvaliadoEm',
] as const;

export function linhasRanking(ranking: LinhaRanking[]): Record<(typeof COLUNAS_RANKING)[number], string | number> [] {
  return ranking.map((l) => ({
    Posicao: l.posicao,
    UF: l.uf,
    Grupo: l.grupo,
    Candidato: l.candidato,
    EmailCandidato: l.emailCandidato,
    Status: rotuloStatus(l.avaliacao),
    Presente: l.avaliacao?.presente ?? '',
    TotalPontos: l.avaliacao ? l.avaliacao.totalPontos : '',
    ChaveVideo: l.avaliacao?.chaveVideo ?? '',
    Apto: l.avaliacao?.apto ?? '',
    AvaliadorNome: l.avaliacao?.avaliadorNome ?? '',
    AvaliadorEmail: l.avaliacao?.avaliadorEmail ?? '',
    AvaliadoEm: l.avaliacao ? formatarTimestamp(l.avaliacao.timestamp) : '',
  }));
}

export function linhasAvaliacoes(avaliacoes: Avaliacao[]): Record<string, string | number>[] {
  return [...avaliacoes]
    .sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR', { numeric: true }) || a.candidato.localeCompare(b.candidato, 'pt-BR'))
    .map((a) => {
      const linha: Record<string, string | number> = {
        Timestamp: formatarTimestamp(a.timestamp),
        SlotId: a.slotId,
        Grupo: a.grupo,
        Candidato: a.candidato,
        EmailCandidato: a.emailCandidato,
        AvaliadorEmail: a.avaliadorEmail,
        AvaliadorNome: a.avaliadorNome,
        Presente: a.presente,
        ChaveVideo: a.chaveVideo ?? '',
      };
      CRITERIOS.forEach((c, i) => (linha[c.coluna] = a.criterios[i] ?? ''));
      linha.TotalPontos = a.totalPontos;
      linha.Apto = a.apto;
      linha.Observacoes = a.observacoes;
      return linha;
    });
}

export function montarWorkbookResultados(XLSX: XLSXModule, ranking: LinhaRanking[], avaliacoes: Avaliacao[]): WorkBook {
  const wb = XLSX.utils.book_new();
  const wsRank = XLSX.utils.json_to_sheet(linhasRanking(ranking), { header: [...COLUNAS_RANKING] });
  wsRank['!cols'] = [8, 5, 9, 32, 32, 26, 14, 11, 10, 14, 28, 30, 20].map((wch) => ({ wch }));
  wsRank['!autofilter'] = { ref: `A1:M${Math.max(ranking.length + 1, 1)}` };
  XLSX.utils.book_append_sheet(wb, wsRank, 'Ranking_Consolidado');

  const wsAval = XLSX.utils.json_to_sheet(linhasAvaliacoes(avaliacoes), { header: [...COLUNAS_AVALIACOES] });
  wsAval['!cols'] = COLUNAS_AVALIACOES.map((c) => ({ wch: Math.max(10, c.length + 2) }));
  XLSX.utils.book_append_sheet(wb, wsAval, 'Avaliacoes_Detalhadas');
  wb.Props = { Title: `Resultados & Ranking (máx. ${PONTUACAO_MAXIMA} pts) — FGV DGPE`, Author: 'FGV DGPE' };
  return wb;
}

export async function baixarResultadosXlsx(ranking: LinhaRanking[], avaliacoes: Avaliacao[]): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = montarWorkbookResultados(XLSX, ranking, avaliacoes);
  const dados = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  baixarBlob(
    new Blob([dados], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    NOME_ARQUIVO_RESULTADOS,
  );
}
