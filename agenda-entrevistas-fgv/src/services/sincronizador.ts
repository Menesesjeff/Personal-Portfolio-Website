import { aplicarReservas, normalizarEmail, normalizarNome } from '../lib/regras';
import type { Participante, Rejeicao, Reserva } from '../lib/types';
import { ClienteAppsScript, ErroRede } from './appsScript';
import { CHAVES, type Armazenamento } from './armazenamento';

export type StatusSync =
  | 'local' // sem planilha configurada: dados só neste aparelho
  | 'sincronizando'
  | 'online' // sincronizado com a planilha
  | 'offline' // planilha inacessível: exibindo cache
  | 'erro'; // planilha respondeu com erro

export interface EstadoSync {
  reservas: Reserva[]; // confirmadas + pendentes (marcadas com pendente: true)
  status: StatusSync;
  ultimaSync: string | null;
  mensagem: string | null;
  endpoint: string;
  pendentes: number;
}

interface ItemFila {
  nome: string;
  email: string;
  slotIds: string[];
  reservasLocais: Reserva[];
}

export interface ResultadoConfirmacao {
  aceitas: Reserva[];
  rejeitadas: Rejeicao[];
  /** true quando foi salvo apenas no aparelho para envio posterior */
  enfileirado: boolean;
}

type Ouvinte = (estado: EstadoSync) => void;

/**
 * Orquestra a leitura/escrita das reservas:
 * planilha (Apps Script) como fonte da verdade + cache/fila no localStorage.
 */
export class Sincronizador {
  private confirmadas: Reserva[];
  private fila: ItemFila[];
  private estado: EstadoSync;
  private ouvintes = new Set<Ouvinte>();
  private emAndamento: Promise<void> | null = null;

  constructor(
    private readonly armazenamento: Armazenamento,
    endpointPadrao: string,
    private readonly criarCliente: (url: string) => ClienteAppsScript = (url) => new ClienteAppsScript(url),
  ) {
    this.confirmadas = armazenamento.ler<Reserva[]>(CHAVES.reservas, []);
    this.fila = armazenamento.ler<ItemFila[]>(CHAVES.fila, []);
    const endpoint = armazenamento.ler<string | null>(CHAVES.endpoint, null) ?? endpointPadrao ?? '';
    this.estado = {
      reservas: [],
      status: endpoint ? 'offline' : 'local',
      ultimaSync: null,
      mensagem: null,
      endpoint: endpoint.trim(),
      pendentes: 0,
    };
    this.recalcular({});
  }

  get atual(): EstadoSync {
    return this.estado;
  }

  assinar(fn: Ouvinte): () => void {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  private recalcular(parcial: Partial<EstadoSync>): void {
    const pendentes = this.fila.flatMap((i) => i.reservasLocais.map((r) => ({ ...r, pendente: true })));
    this.estado = {
      ...this.estado,
      ...parcial,
      reservas: [...this.confirmadas, ...pendentes],
      pendentes: this.fila.length,
    };
    this.ouvintes.forEach((fn) => fn(this.estado));
  }

  private persistir(): void {
    this.armazenamento.gravar(CHAVES.reservas, this.confirmadas);
    this.armazenamento.gravar(CHAVES.fila, this.fila);
  }

  private cliente(): ClienteAppsScript | null {
    return this.estado.endpoint ? this.criarCliente(this.estado.endpoint) : null;
  }

  definirEndpoint(url: string): void {
    const limpo = url.trim();
    this.armazenamento.gravar(CHAVES.endpoint, limpo);
    this.recalcular({ endpoint: limpo, status: limpo ? 'offline' : 'local', mensagem: null });
  }

  /** Envia a fila pendente e baixa a lista atualizada da planilha. */
  sincronizar(): Promise<void> {
    if (this.emAndamento) return this.emAndamento;
    this.emAndamento = this.executarSync().finally(() => {
      this.emAndamento = null;
    });
    return this.emAndamento;
  }

  private async executarSync(): Promise<void> {
    const cliente = this.cliente();
    if (!cliente) {
      this.recalcular({ status: 'local', mensagem: null });
      return;
    }
    this.recalcular({ status: 'sincronizando' });
    try {
      while (this.fila.length > 0) {
        const item = this.fila[0];
        await cliente.reservar({ nome: item.nome, email: item.email }, item.slotIds);
        this.fila.shift();
        this.persistir();
      }
      this.confirmadas = await cliente.listar();
      this.persistir();
      this.recalcular({ status: 'online', ultimaSync: new Date().toISOString(), mensagem: null });
    } catch (e) {
      this.recalcular({
        status: e instanceof ErroRede ? 'offline' : 'erro',
        mensagem: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /** Regra 4: revalida contra o estado mais recente e persiste. */
  async confirmar(participante: Participante, slotIds: string[]): Promise<ResultadoConfirmacao> {
    const p = { nome: normalizarNome(participante.nome), email: normalizarEmail(participante.email) };
    const cliente = this.cliente();

    if (!cliente) {
      const r = aplicarReservas(this.confirmadas, p, slotIds);
      this.confirmadas = r.reservas;
      this.persistir();
      this.recalcular({ status: 'local' });
      return { aceitas: r.aceitas, rejeitadas: r.rejeitadas, enfileirado: false };
    }

    this.recalcular({ status: 'sincronizando' });
    try {
      const r = await cliente.reservar(p, slotIds);
      this.confirmadas = r.reservas;
      this.persistir();
      this.recalcular({ status: 'online', ultimaSync: new Date().toISOString(), mensagem: null });
      return { aceitas: r.aceitas, rejeitadas: r.rejeitadas, enfileirado: false };
    } catch (e) {
      if (!(e instanceof ErroRede)) {
        this.recalcular({ status: 'erro', mensagem: e instanceof Error ? e.message : String(e) });
        throw e;
      }
      // Sem conexão: valida contra o cache e guarda na fila (o servidor revalida depois).
      const r = aplicarReservas(this.estado.reservas, p, slotIds);
      if (r.aceitas.length > 0) {
        this.fila.push({ ...p, slotIds: r.aceitas.map((a) => a.slotId), reservasLocais: r.aceitas });
        this.persistir();
      }
      this.recalcular({ status: 'offline', mensagem: e.message });
      return { aceitas: r.aceitas, rejeitadas: r.rejeitadas, enfileirado: true };
    }
  }

  async remover(id: string, token: string): Promise<void> {
    // Pendente na fila: remove só localmente
    const idxFila = this.fila.findIndex((i) => i.reservasLocais.some((r) => r.id === id));
    if (idxFila >= 0) {
      const item = this.fila[idxFila];
      item.reservasLocais = item.reservasLocais.filter((r) => r.id !== id);
      item.slotIds = item.reservasLocais.map((r) => r.slotId);
      if (item.reservasLocais.length === 0) this.fila.splice(idxFila, 1);
      this.persistir();
      this.recalcular({});
      return;
    }
    const cliente = this.cliente();
    if (!cliente) {
      this.confirmadas = this.confirmadas.filter((r) => r.id !== id);
      this.persistir();
      this.recalcular({});
      return;
    }
    this.recalcular({ status: 'sincronizando' });
    try {
      this.confirmadas = await cliente.remover(id, token);
      this.persistir();
      this.recalcular({ status: 'online', ultimaSync: new Date().toISOString(), mensagem: null });
    } catch (e) {
      this.recalcular({
        status: e instanceof ErroRede ? 'offline' : 'erro',
        mensagem: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }
}
