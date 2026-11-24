import { CAPACIDADE_POR_BANCA, SLOT_POR_ID } from '../data/grade';
import type { MotivoBloqueio, Participante, Rejeicao, Reserva, ResultadoReserva } from './types';

// ---------------------------------------------------------------------------
// Validação de identificação
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizarNome(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ');
}

export function emailValido(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Nome completo: ao menos 2 palavras com 2+ letras no total de 5+ caracteres. */
export function nomeValido(nome: string): boolean {
  const n = normalizarNome(nome);
  return n.length >= 5 && n.split(' ').filter((p) => p.length >= 2).length >= 2;
}

export interface ErrosIdentificacao {
  nome?: string;
  email?: string;
}

export function validarIdentificacao(p: Participante): ErrosIdentificacao {
  const erros: ErrosIdentificacao = {};
  if (!normalizarNome(p.nome)) erros.nome = 'Informe seu nome completo.';
  else if (!nomeValido(p.nome)) erros.nome = 'Informe nome e sobrenome.';
  if (!p.email.trim()) erros.email = 'Informe seu e-mail.';
  else if (!emailValido(p.email)) erros.email = 'E-mail em formato inválido.';
  return erros;
}

// ---------------------------------------------------------------------------
// Ocupação
// ---------------------------------------------------------------------------

export function contarPorSlot(reservas: Reserva[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const r of reservas) mapa[r.slotId] = (mapa[r.slotId] ?? 0) + 1;
  return mapa;
}

export function ocupacao(slotId: string, reservas: Reserva[]): number {
  return reservas.reduce((n, r) => (r.slotId === slotId ? n + 1 : n), 0);
}

export function slotLotado(slotId: string, reservas: Reserva[]): boolean {
  return ocupacao(slotId, reservas) >= CAPACIDADE_POR_BANCA;
}

export function reservasDoParticipante(email: string, reservas: Reserva[]): Reserva[] {
  const e = normalizarEmail(email);
  if (!e) return [];
  return reservas.filter((r) => normalizarEmail(r.email) === e);
}

/** Chave da faixa horária de um dia: "D1|H1". */
export function chaveFaixa(slotId: string): string | null {
  const s = SLOT_POR_ID[slotId];
  return s ? `${s.diaId}|${s.faixaId}` : null;
}

// ---------------------------------------------------------------------------
// Seleção do participante
// ---------------------------------------------------------------------------

export type EstadoSlot =
  | { tipo: 'selecionado' }
  | { tipo: 'reservado' } // reserva já confirmada do próprio participante
  | { tipo: 'disponivel' }
  | { tipo: 'bloqueado'; motivo: MotivoBloqueio };

/**
 * Determina como um slot deve ser exibido/se pode ser clicado, considerando:
 * - regra 2 (1 banca por faixa/dia, incluindo reservas já confirmadas do e-mail);
 * - regra 3 (capacidade de 2 reservas por banca).
 */
export function estadoDoSlot(
  slotId: string,
  selecao: string[],
  reservas: Reserva[],
  email: string,
): EstadoSlot {
  if (!SLOT_POR_ID[slotId]) return { tipo: 'bloqueado', motivo: 'inexistente' };
  if (selecao.includes(slotId)) return { tipo: 'selecionado' };
  const minhas = reservasDoParticipante(email, reservas);
  if (minhas.some((r) => r.slotId === slotId)) return { tipo: 'reservado' };

  const chave = chaveFaixa(slotId);
  const faixaTomada =
    selecao.some((id) => chaveFaixa(id) === chave) || minhas.some((r) => chaveFaixa(r.slotId) === chave);
  if (faixaTomada) return { tipo: 'bloqueado', motivo: 'faixa-ocupada' };

  if (slotLotado(slotId, reservas)) return { tipo: 'bloqueado', motivo: 'lotada' };
  return { tipo: 'disponivel' };
}

/** Alterna um slot na seleção respeitando as regras. Retorna a nova seleção (ou a mesma se bloqueado). */
export function alternarSelecao(slotId: string, selecao: string[], reservas: Reserva[], email: string): string[] {
  if (selecao.includes(slotId)) return selecao.filter((id) => id !== slotId);
  const est = estadoDoSlot(slotId, selecao, reservas, email);
  if (est.tipo !== 'disponivel') return selecao;
  return [...selecao, slotId];
}

/** Remove da seleção os slots que deixaram de ser válidos (ex.: lotaram após uma sincronização). */
export function sanearSelecao(selecao: string[], reservas: Reserva[], email: string): string[] {
  const resultado: string[] = [];
  for (const id of selecao) {
    if (estadoDoSlot(id, resultado, reservas, email).tipo === 'disponivel') resultado.push(id);
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Persistência (mesma lógica do scripts/Code.gs)
// ---------------------------------------------------------------------------

export function gerarId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return `R-${c.randomUUID()}`;
  return `R-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Revalida e aplica uma solicitação de reserva sobre o estado atual.
 * Usado no modo local e espelhado no Apps Script (que roda sob LockService).
 */
export function aplicarReservas(
  atuais: Reserva[],
  participante: Participante,
  slotIds: string[],
  agora: () => string = () => new Date().toISOString(),
  novoId: () => string = gerarId,
): ResultadoReserva {
  const nome = normalizarNome(participante.nome);
  const email = normalizarEmail(participante.email);
  const reservas = [...atuais];
  const aceitas: Reserva[] = [];
  const rejeitadas: Rejeicao[] = [];

  for (const slotId of Array.from(new Set(slotIds))) {
    const est = estadoDoSlot(slotId, [], reservas, email);
    if (est.tipo === 'reservado') {
      rejeitadas.push({ slotId, motivo: 'ja-reservado' });
      continue;
    }
    if (est.tipo === 'bloqueado') {
      rejeitadas.push({ slotId, motivo: est.motivo });
      continue;
    }
    const nova: Reserva = { id: novoId(), timestamp: agora(), slotId, nome, email };
    reservas.push(nova);
    aceitas.push(nova);
  }
  return { aceitas, rejeitadas, reservas };
}

export interface ResultadoValidacaoEnvio {
  ok: boolean;
  erros: ErrosIdentificacao & { selecao?: string };
  rejeitadas: Rejeicao[];
}

/** Regra 4: valida identificação e revalida a disponibilidade antes de persistir. */
export function validarEnvio(
  participante: Participante,
  selecao: string[],
  reservas: Reserva[],
): ResultadoValidacaoEnvio {
  const erros: ResultadoValidacaoEnvio['erros'] = validarIdentificacao(participante);
  if (selecao.length === 0) erros.selecao = 'Selecione ao menos um horário.';
  // aplicarReservas processa a seleção em sequência, então também detecta
  // conflito interno (duas bancas da mesma faixa/dia na própria seleção).
  const { rejeitadas } = aplicarReservas(reservas, participante, selecao);
  return { ok: Object.keys(erros).length === 0 && rejeitadas.length === 0, erros, rejeitadas };
}

export const MENSAGEM_MOTIVO: Record<MotivoBloqueio, string> = {
  lotada: 'Banca lotada (2/2)',
  'faixa-ocupada': 'Você já tem uma banca nesta faixa horária',
  'ja-reservado': 'Você já reservou esta banca',
  inexistente: 'Banca inexistente',
};
