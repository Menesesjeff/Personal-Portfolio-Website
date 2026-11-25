/**
 * Funções de apresentação da grade (filtros, status de vagas, conflitos).
 * Não alteram nenhuma regra de negócio: apenas decidem o que mostrar e como.
 */
import { BANCAS, CAPACIDADE_POR_BANCA, FAIXAS, SLOTS, SLOT_POR_ID, slotEm } from '../data/grade';
import { chaveFaixa } from './regras';
import type { Estado, Faixa, Slot } from './types';

export interface FiltrosGrade {
  faixaId: string; // '' = todas
  estados: Estado[]; // [] = todos
  soComVaga: boolean;
}

export const FILTROS_VAZIOS: FiltrosGrade = { faixaId: '', estados: [], soComVaga: false };

export function contarFiltrosAtivos(f: FiltrosGrade): number {
  return (f.faixaId ? 1 : 0) + (f.estados.length > 0 ? 1 : 0) + (f.soComVaga ? 1 : 0);
}

export function alternarEstadoFiltro(f: FiltrosGrade, uf: Estado): FiltrosGrade {
  const estados = f.estados.includes(uf) ? f.estados.filter((e) => e !== uf) : [...f.estados, uf];
  return { ...f, estados };
}

export type NivelVagas = 'disponivel' | 'ultima' | 'lotada';

/** 0/2 → disponível · 1/2 → última vaga · 2/2 → lotada */
export function nivelVagas(ocupacao: number): NivelVagas {
  if (ocupacao >= CAPACIDADE_POR_BANCA) return 'lotada';
  if (ocupacao === CAPACIDADE_POR_BANCA - 1) return 'ultima';
  return 'disponivel';
}

/**
 * Um slot aparece se passar em todos os filtros. Slots em `manter`
 * (selecionados ou já confirmados pelo participante) aparecem sempre,
 * para que ninguém "perca" uma escolha ao filtrar.
 */
export function slotVisivel(
  slot: Slot,
  f: FiltrosGrade,
  ocupacao: Record<string, number>,
  manter: ReadonlySet<string> = new Set(),
): boolean {
  if (manter.has(slot.id)) return true;
  if (f.faixaId && slot.faixaId !== f.faixaId) return false;
  if (f.estados.length > 0 && !f.estados.includes(slot.estado)) return false;
  if (f.soComVaga && (ocupacao[slot.id] ?? 0) >= CAPACIDADE_POR_BANCA) return false;
  return true;
}

export interface FaixaVisivel {
  faixa: Faixa;
  slots: Slot[];
}

/** Faixas do dia com os slots que passam nos filtros (faixas vazias são omitidas). */
export function faixasVisiveis(
  diaId: string,
  f: FiltrosGrade,
  ocupacao: Record<string, number>,
  manter: ReadonlySet<string> = new Set(),
): FaixaVisivel[] {
  return FAIXAS.map((faixa) => ({
    faixa,
    slots: BANCAS.map((b) => slotEm(diaId, faixa.id, b)).filter((s) => slotVisivel(s, f, ocupacao, manter)),
  })).filter((fv) => fv.slots.length > 0);
}

/** Vagas ainda livres num dia (20 bancas × 2 = 40 no máximo). */
export function vagasLivresNoDia(diaId: string, ocupacao: Record<string, number>): number {
  return SLOTS.filter((s) => s.diaId === diaId).reduce(
    (soma, s) => soma + Math.max(0, CAPACIDADE_POR_BANCA - (ocupacao[s.id] ?? 0)),
    0,
  );
}

/** "segunda" → "Seg", "terça" → "Ter" … */
export function abreviarSemana(semana: string): string {
  const s = semana.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return s.charAt(0).toUpperCase() + s.slice(1, 3);
}

export interface Conflito {
  banca: string;
  confirmado: boolean; // true = reserva já confirmada; false = seleção atual
}

/**
 * Qual banca da mesma faixa/dia está ocupando a vez do participante
 * (para explicar o bloqueio da regra "1 banca por faixa").
 */
export function conflitoNaFaixa(slotId: string, selecao: string[], confirmados: string[]): Conflito | null {
  const chave = chaveFaixa(slotId);
  if (!chave) return null;
  const sel = selecao.find((id) => id !== slotId && chaveFaixa(id) === chave);
  if (sel) return { banca: SLOT_POR_ID[sel].banca, confirmado: false };
  const conf = confirmados.find((id) => id !== slotId && chaveFaixa(id) === chave);
  if (conf) return { banca: SLOT_POR_ID[conf].banca, confirmado: true };
  return null;
}
