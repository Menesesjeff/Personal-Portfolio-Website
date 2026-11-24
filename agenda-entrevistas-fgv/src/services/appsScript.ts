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
