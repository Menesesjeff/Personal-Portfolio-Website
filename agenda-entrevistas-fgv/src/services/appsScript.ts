import {
  AUSENTE,
  CRITERIOS,
  DADOS_VAZIOS,
  normalizarGrupo,
  type Avaliacao,
  type DadosBancas,
  type MapaCandidatos,
  type Parecer,
  type Presenca,
} from '../lib/avaliacao';
import type { Participante, Rejeicao, Reserva, ResultadoReserva } from '../lib/types';

/**
 * Cliente do Web App do Google Apps Script (/exec).
 *
 * - Leitura: GET ?action=list
 * - Escrita: POST com corpo JSON enviado como `text/plain` — evita o preflight
 *   CORS, que o Apps Script não responde.
 */

export class ErroRede extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroRede';
  }
}

export class ErroServidor extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroServidor';
  }
}

export function urlValida(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.hostname === 'localhost';
  } catch {
    return false;
  }
}

/** Converte uma linha vinda da planilha em Reserva (tolerante a Date/strings). */
export function normalizarReserva(bruta: Record<string, unknown>): Reserva | null {
  const slotId = String(bruta.slotId ?? bruta.SlotID ?? '').trim();
  const email = String(bruta.email ?? bruta.Email ?? '').trim().toLowerCase();
  if (!slotId || !email) return null;
  const ts = bruta.timestamp ?? bruta.Timestamp;
  const data = ts ? new Date(String(ts)) : new Date();
  return {
    id: String(bruta.id ?? bruta.ID ?? `${slotId}:${email}`),
    timestamp: Number.isNaN(data.getTime()) ? String(ts) : data.toISOString(),
    slotId,
    nome: String(bruta.nome ?? bruta.Nome ?? '').trim(),
    email,
  };
}

function normalizarLista(lista: unknown): Reserva[] {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((r) => (r && typeof r === 'object' ? normalizarReserva(r as Record<string, unknown>) : null))
    .filter((r): r is Reserva => r !== null);
}

function numeroOuNulo(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Converte uma avaliação vinda do Apps Script (tolerante a campos ausentes). */
export function normalizarAvaliacao(bruta: Record<string, unknown>): Avaliacao | null {
  const grupo = normalizarGrupo(String(bruta.grupo ?? ''));
  const emailCandidato = String(bruta.emailCandidato ?? '').trim().toLowerCase();
  if (!grupo || !emailCandidato) return null;
  const presente = (String(bruta.presente ?? '') === AUSENTE ? AUSENTE : 'Sim, presente') as Presenca;
  const crit = Array.isArray(bruta.criterios) ? bruta.criterios : [];
  return {
    timestamp: String(bruta.timestamp ?? ''),
    slotId: String(bruta.slotId ?? '').toUpperCase(),
    grupo,
    candidato: String(bruta.candidato ?? '').trim(),
    emailCandidato,
    avaliadorEmail: String(bruta.avaliadorEmail ?? '').trim().toLowerCase(),
    avaliadorNome: String(bruta.avaliadorNome ?? '').trim(),
    presente,
    chaveVideo: numeroOuNulo(bruta.chaveVideo),
    criterios: CRITERIOS.map((_, i) => numeroOuNulo(crit[i])),
    totalPontos: numeroOuNulo(bruta.totalPontos) ?? 0,
    apto: (String(bruta.apto ?? '') === 'Sim, apto' ? 'Sim, apto' : 'Não, não-apto') as Parecer,
    observacoes: String(bruta.observacoes ?? ''),
  };
}

function normalizarCandidatos(bruto: unknown): MapaCandidatos {
  const mapa: MapaCandidatos = {};
  if (!bruto || typeof bruto !== 'object') return mapa;
  for (const [g, lista] of Object.entries(bruto as Record<string, unknown>)) {
    const grupo = normalizarGrupo(g);
    if (!grupo || !Array.isArray(lista)) continue;
    for (const c of lista as Record<string, unknown>[]) {
      const email = String(c?.email ?? '').trim().toLowerCase();
      if (!email) continue;
      (mapa[grupo] ??= []).push({ nome: String(c?.nome ?? '').trim(), email });
    }
  }
  return mapa;
}

function normalizarMapaUrls(bruto: unknown, chave: (k: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!bruto || typeof bruto !== 'object') return out;
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    const url = String(v ?? '').trim();
    if (/^https?:\/\//i.test(url)) out[chave(k)] = url;
  }
  return out;
}

function normalizarListaAvaliacoes(lista: unknown): Avaliacao[] {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((a) => (a && typeof a === 'object' ? normalizarAvaliacao(a as Record<string, unknown>) : null))
    .filter((a): a is Avaliacao => a !== null);
}

/** Extrai candidatos/links/avaliações da resposta. `suportado` = false em scripts antigos. */
export function normalizarDadosBancas(json: Record<string, unknown>): { dados: DadosBancas; suportado: boolean } {
  const suportado = 'candidatos' in json || 'avaliacoes' in json;
  if (!suportado) return { dados: DADOS_VAZIOS, suportado };
  const links = (json.links ?? {}) as Record<string, unknown>;
  return {
    suportado,
    dados: {
      candidatos: normalizarCandidatos(json.candidatos),
      links: {
        porSlot: normalizarMapaUrls(links.porSlot, (k) => k.toUpperCase()),
        porGrupo: normalizarMapaUrls(links.porGrupo, normalizarGrupo),
      },
      avaliacoes: normalizarListaAvaliacoes(json.avaliacoes),
    },
  };
}

type Fetch = typeof fetch;

export class ClienteAppsScript {
  constructor(
    private readonly url: string,
    private readonly fetcher: Fetch = (...args) => fetch(...args),
    private readonly timeoutMs = 20000,
  ) {}

  private async requisitar(init?: RequestInit, query = ''): Promise<Record<string, unknown>> {
    const controle = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer = controle ? setTimeout(() => controle.abort(), this.timeoutMs) : undefined;
    let resp: Response;
    try {
      const sep = this.url.includes('?') ? '&' : '?';
      resp = await this.fetcher(`${this.url}${sep}${query}`, {
        redirect: 'follow',
        ...init,
        signal: controle?.signal,
      });
    } catch (e) {
      throw new ErroRede(e instanceof Error ? e.message : 'Falha de rede');
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!resp.ok) throw new ErroServidor(`HTTP ${resp.status}`);
    let json: Record<string, unknown>;
    try {
      json = (await resp.json()) as Record<string, unknown>;
    } catch {
      throw new ErroServidor('Resposta inválida do Apps Script (verifique a implantação e o acesso "Qualquer pessoa").');
    }
    if (json.ok === false) throw new ErroServidor(String(json.error ?? 'Erro no Apps Script'));
    return json;
  }

  async listar(): Promise<Reserva[]> {
    const json = await this.requisitar(undefined, `action=list&t=${Date.now()}`);
    return normalizarLista(json.reservas);
  }

  /** Reservas + dados das bancas do avaliador (candidatos, links do Teams e avaliações). */
  async listarCompleto(
    emailAvaliador: string,
  ): Promise<{ reservas: Reserva[]; dados: DadosBancas; suportado: boolean }> {
    const email = emailAvaliador.trim().toLowerCase();
    const query = `action=list${email ? `&email=${encodeURIComponent(email)}` : ''}&t=${Date.now()}`;
    const json = await this.requisitar(undefined, query);
    return { reservas: normalizarLista(json.reservas), ...normalizarDadosBancas(json) };
  }

  async salvarAvaliacao(avaliacao: Avaliacao): Promise<{ avaliacao: Avaliacao | null; avaliacoes: Avaliacao[]; editada: boolean }> {
    const json = await this.requisitar({
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'salvarAvaliacao', avaliacao }),
    });
    return {
      avaliacao: json.avaliacao ? normalizarAvaliacao(json.avaliacao as Record<string, unknown>) : null,
      avaliacoes: normalizarListaAvaliacoes(json.avaliacoes),
      editada: Boolean(json.editada),
    };
  }

  async resultados(token: string): Promise<{ candidatos: MapaCandidatos; avaliacoes: Avaliacao[] }> {
    const json = await this.requisitar({
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'resultados', token }),
    });
    return { candidatos: normalizarCandidatos(json.candidatos), avaliacoes: normalizarListaAvaliacoes(json.avaliacoes) };
  }

  async reservar(participante: Participante, slotIds: string[]): Promise<ResultadoReserva> {
    const json = await this.requisitar({
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'reserve', nome: participante.nome, email: participante.email, slotIds }),
    });
    return {
      aceitas: normalizarLista(json.aceitas),
      rejeitadas: (Array.isArray(json.rejeitadas) ? json.rejeitadas : []) as Rejeicao[],
      reservas: normalizarLista(json.reservas),
    };
  }

  async remover(id: string, token: string): Promise<Reserva[]> {
    const json = await this.requisitar({
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'delete', id, token }),
    });
    return normalizarLista(json.reservas);
  }
}
