import {
  aplicarAvaliacao,
  candidatosDoGrupo,
  DADOS_VAZIOS,
  podeAvaliar,
  type Avaliacao,
  type DadosBancas,
  type MapaCandidatos,
} from '../lib/avaliacao';
import { aplicarReservas, emailValido, normalizarEmail, normalizarNome } from '../lib/regras';
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
  /** Candidatos, links do Teams e avaliações das bancas do avaliador identificado. */
  dados: DadosBancas;
  /** false quando a planilha ainda usa um Code.gs sem suporte a avaliações. */
  avaliacaoDisponivel: boolean;
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
  /** Pedido de nova sincronização feito enquanto outra estava em andamento. */
  private ressincronizar = false;
  private emailAvaliador = '';

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
      dados: armazenamento.ler<DadosBancas>(CHAVES.dadosBancas, DADOS_VAZIOS),
      avaliacaoDisponivel: true,
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

  /** Informa o e-mail do avaliador para trazer os dados das bancas dele. */
  definirAvaliador(email: string): void {
    const e = emailValido(email) ? normalizarEmail(email) : '';
    if (e === this.emailAvaliador) return;
    this.emailAvaliador = e;
    if (!this.estado.endpoint) return;
    // Candidatos de outro avaliador (ex.: celular compartilhado) não ficam na tela.
    this.definirDados(DADOS_VAZIOS);
    // Se uma sincronização (ainda sem este e-mail) estiver em andamento, roda outra ao terminar.
    if (this.emAndamento) this.ressincronizar = true;
    else void this.sincronizar();
  }

  private definirDados(dados: DadosBancas, avaliacaoDisponivel = this.estado.avaliacaoDisponivel): void {
    this.armazenamento.gravar(CHAVES.dadosBancas, dados);
    this.recalcular({ dados, avaliacaoDisponivel });
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
      if (this.ressincronizar) {
        this.ressincronizar = false;
        void this.sincronizar();
      }
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
      const emailConsultado = this.emailAvaliador;
      const r = await cliente.listarCompleto(emailConsultado);
      this.confirmadas = r.reservas;
      this.persistir();
      // Se o e-mail mudou durante a consulta, a resposta é de outro avaliador: descarta os dados dela.
      const dadosAtuais = emailConsultado === this.emailAvaliador;
      if (dadosAtuais) this.armazenamento.gravar(CHAVES.dadosBancas, r.dados);
      else this.ressincronizar = true;
      this.recalcular({
        status: 'online',
        ultimaSync: new Date().toISOString(),
        mensagem: null,
        dados: dadosAtuais ? r.dados : this.estado.dados,
        avaliacaoDisponivel: r.suportado,
      });
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

  /**
   * Grava a avaliação de um candidato. Na planilha, o Apps Script revalida tudo e
   * atualiza a linha existente (Grupo + EmailCandidato) em vez de duplicar.
   */
  async salvarAvaliacao(avaliacao: Avaliacao): Promise<{ editada: boolean }> {
    const cliente = this.cliente();
    if (!cliente) {
      if (!podeAvaliar(avaliacao.slotId, avaliacao.grupo, avaliacao.avaliadorEmail, this.confirmadas)) {
        throw new Error('Só os avaliadores desta banca podem avaliar este grupo.');
      }
      const existe = candidatosDoGrupo(avaliacao.grupo, this.estado.dados.candidatos).some(
        (c) => c.email === avaliacao.emailCandidato,
      );
      if (!existe) throw new Error('Candidato não encontrado neste grupo.');
      const r = aplicarAvaliacao(this.estado.dados.avaliacoes, avaliacao);
      this.definirDados({ ...this.estado.dados, avaliacoes: r.lista });
      return { editada: r.editada };
    }
    const r = await cliente.salvarAvaliacao(avaliacao);
    let lista = r.avaliacoes;
    if (lista.length === 0) lista = aplicarAvaliacao(this.estado.dados.avaliacoes, r.avaliacao ?? avaliacao).lista;
    this.definirDados({ ...this.estado.dados, avaliacoes: lista });
    return { editada: r.editada };
  }

  /** Todos os candidatos e avaliações (Resultados & Ranking da coordenação). */
  async carregarResultados(token: string): Promise<{ candidatos: MapaCandidatos; avaliacoes: Avaliacao[] }> {
    const cliente = this.cliente();
    if (!cliente) return { candidatos: this.estado.dados.candidatos, avaliacoes: this.estado.dados.avaliacoes };
    return cliente.resultados(token);
  }
}
