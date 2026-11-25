import { describe, expect, it, vi } from 'vitest';
import { aplicarReservas } from '../src/lib/regras';
import type { Reserva } from '../src/lib/types';
import { ClienteAppsScript, ErroServidor, normalizarReserva, urlValida } from '../src/services/appsScript';
import { CHAVES, criarArmazenamentoMemoria } from '../src/services/armazenamento';
import { Sincronizador } from '../src/services/sincronizador';

const URL_EXEC = 'https://script.google.com/macros/s/abc/exec';
const EU = { nome: 'Ana Lima', email: 'ana@fgv.br' };

/** Simula o Apps Script (Code.gs) em memória, inclusive as regras. */
function servidorFalso(inicial: Reserva[] = []) {
  let banco = [...inicial];
  let online = true;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (!online) throw new TypeError('Failed to fetch');
    const ok = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });
    if (!init?.method || init.method === 'GET') {
      expect(url).toContain('action=list');
      return ok({ ok: true, reservas: banco });
    }
    expect((init.headers as Record<string, string>)['Content-Type']).toMatch(/^text\/plain/);
    const corpo = JSON.parse(String(init.body));
    if (corpo.action === 'reserve') {
      const r = aplicarReservas(banco, corpo, corpo.slotIds);
      banco = r.reservas;
      return ok({ ok: true, ...r });
    }
    if (corpo.action === 'delete') {
      if (corpo.token !== 'segredo') return ok({ ok: false, error: 'Não autorizado.' });
      banco = banco.filter((r) => r.id !== corpo.id);
      return ok({ ok: true, reservas: banco });
    }
    return ok({ ok: false, error: 'acao' });
  });
  return {
    fetcher,
    get banco() {
      return banco;
    },
    setOnline(v: boolean) {
      online = v;
    },
  };
}

function criar(servidor: ReturnType<typeof servidorFalso>, endpoint = URL_EXEC) {
  const arm = criarArmazenamentoMemoria();
  const sync = new Sincronizador(arm, endpoint, (url) => new ClienteAppsScript(url, servidor.fetcher as unknown as typeof fetch));
  return { arm, sync };
}

describe('cliente Apps Script', () => {
  it('valida URL', () => {
    expect(urlValida(URL_EXEC)).toBe(true);
    expect(urlValida('http://exemplo.com/exec')).toBe(false);
    expect(urlValida('não é url')).toBe(false);
  });

  it('normaliza linhas vindas da planilha', () => {
    expect(
      normalizarReserva({ ID: 'R1', Timestamp: '2026-11-20T12:00:00Z', SlotID: 'SLOT-001', Nome: ' Ana ', Email: 'ANA@X.COM' }),
    ).toEqual({ id: 'R1', timestamp: '2026-11-20T12:00:00.000Z', slotId: 'SLOT-001', nome: 'Ana', email: 'ana@x.com' });
    expect(normalizarReserva({ slotId: '' })).toBeNull();
  });

  it('propaga erro do servidor', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'falhou' })));
    await expect(new ClienteAppsScript(URL_EXEC, fetcher as unknown as typeof fetch).listar()).rejects.toBeInstanceOf(ErroServidor);
  });

  it('acusa resposta não-JSON (implantação sem acesso público)', async () => {
    const fetcher = vi.fn(async () => new Response('<html>login</html>'));
    await expect(new ClienteAppsScript(URL_EXEC, fetcher as unknown as typeof fetch).listar()).rejects.toThrow(/Resposta inválida/);
  });
});

describe('Sincronizador', () => {
  it('modo local (sem endpoint): grava no localStorage aplicando as regras', async () => {
    const arm = criarArmazenamentoMemoria();
    const sync = new Sincronizador(arm, '');
    expect(sync.atual.status).toBe('local');
    const r = await sync.confirmar(EU, ['SLOT-001', 'SLOT-002']);
    expect(r.aceitas.map((a) => a.slotId)).toEqual(['SLOT-001']);
    expect(r.rejeitadas).toEqual([{ slotId: 'SLOT-002', motivo: 'faixa-ocupada' }]);
    expect(arm.ler<Reserva[]>(CHAVES.reservas, [])).toHaveLength(1);
    // recarregando o app, o cache é lido
    expect(new Sincronizador(arm, '').atual.reservas).toHaveLength(1);
  });

  it('lê da planilha e cacheia', async () => {
    const srv = servidorFalso([{ id: 'X', timestamp: '2026-11-20T12:00:00.000Z', slotId: 'SLOT-005', nome: 'Zé Lima', email: 'ze@x.com' }]);
    const { sync, arm } = criar(srv);
    await sync.sincronizar();
    expect(sync.atual.status).toBe('online');
    expect(sync.atual.reservas.map((r) => r.slotId)).toEqual(['SLOT-005']);
    expect(arm.ler<Reserva[]>(CHAVES.reservas, [])).toHaveLength(1);
  });

  it('servidor revalida: banca que lotou por outra pessoa é rejeitada', async () => {
    const srv = servidorFalso();
    const { sync } = criar(srv);
    await sync.sincronizar();
    // Duas outras pessoas reservam diretamente no servidor depois do sync
    await new ClienteAppsScript(URL_EXEC, srv.fetcher as unknown as typeof fetch).reservar({ nome: 'Pessoa Um', email: 'p1@x.com' }, ['SLOT-010']);
    await new ClienteAppsScript(URL_EXEC, srv.fetcher as unknown as typeof fetch).reservar({ nome: 'Pessoa Dois', email: 'p2@x.com' }, ['SLOT-010']);
    const r = await sync.confirmar(EU, ['SLOT-010', 'SLOT-030']);
    expect(r.enfileirado).toBe(false);
    expect(r.aceitas.map((a) => a.slotId)).toEqual(['SLOT-030']);
    expect(r.rejeitadas).toEqual([{ slotId: 'SLOT-010', motivo: 'lotada' }]);
    expect(srv.banco).toHaveLength(3);
    expect(sync.atual.reservas).toHaveLength(3);
  });

  it('offline: usa cache, enfileira e envia quando a conexão volta', async () => {
    const srv = servidorFalso();
    const { sync, arm } = criar(srv);
    await sync.sincronizar();
    srv.setOnline(false);

    await sync.sincronizar();
    expect(sync.atual.status).toBe('offline');

    const r = await sync.confirmar(EU, ['SLOT-040']);
    expect(r.enfileirado).toBe(true);
    expect(sync.atual.pendentes).toBe(1);
    expect(sync.atual.reservas[0]).toMatchObject({ slotId: 'SLOT-040', pendente: true });
    expect(arm.ler<unknown[]>(CHAVES.fila, [])).toHaveLength(1);

    srv.setOnline(true);
    await sync.sincronizar();
    expect(sync.atual.status).toBe('online');
    expect(sync.atual.pendentes).toBe(0);
    expect(srv.banco.map((x) => x.slotId)).toEqual(['SLOT-040']);
    expect(sync.atual.reservas[0].pendente).toBeUndefined();
  });

  it('remove reserva na planilha com token da coordenação', async () => {
    const srv = servidorFalso();
    const { sync } = criar(srv);
    const r = await sync.confirmar(EU, ['SLOT-001']);
    await expect(sync.remover(r.aceitas[0].id, 'errado')).rejects.toThrow('Não autorizado.');
    expect(sync.atual.status).toBe('erro');
    await sync.remover(r.aceitas[0].id, 'segredo');
    expect(srv.banco).toHaveLength(0);
    expect(sync.atual.reservas).toHaveLength(0);
  });

  it('troca de endpoint pela coordenação é persistida', async () => {
    const arm = criarArmazenamentoMemoria();
    const sync = new Sincronizador(arm, '');
    sync.definirEndpoint(` ${URL_EXEC} `);
    expect(sync.atual.endpoint).toBe(URL_EXEC);
    expect(new Sincronizador(arm, '').atual.endpoint).toBe(URL_EXEC);
    sync.definirEndpoint('');
    expect(sync.atual.status).toBe('local');
  });

  it('notifica assinantes', async () => {
    const sync = new Sincronizador(criarArmazenamentoMemoria(), '');
    const ouvinte = vi.fn();
    const sair = sync.assinar(ouvinte);
    await sync.confirmar(EU, ['SLOT-001']);
    expect(ouvinte).toHaveBeenCalled();
    sair();
  });
});

describe('Sincronizador — avaliações', () => {
  it('lê candidatos, links e avaliações do GET list (com o e-mail do avaliador)', async () => {
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toContain('email=ana%40fgv.br');
      return new Response(
        JSON.stringify({
          ok: true,
          reservas: [{ id: 'R1', timestamp: '2026-11-20T12:00:00Z', slotId: 'SLOT-001', nome: 'Ana', email: 'ana@fgv.br' }],
          candidatos: { ' al g1 ': [{ nome: 'C1', email: ' C1@X.com ' }] },
          links: { porSlot: { 'slot-001': 'https://teams/x' }, porGrupo: { 'al g1': 'javascript:alert(1)' } },
          avaliacoes: [{ grupo: 'AL G1', emailCandidato: 'c1@x.com', presente: 'Não, ausente', totalPontos: 0, apto: 'Não, não-apto' }],
        }),
      );
    });
    const sync = new Sincronizador(criarArmazenamentoMemoria(), URL_EXEC, (u) => new ClienteAppsScript(u, fetcher as unknown as typeof fetch));
    sync.definirAvaliador('ANA@fgv.br');
    await sync.sincronizar();
    expect(sync.atual.dados.candidatos).toEqual({ 'AL G1': [{ nome: 'C1', email: 'c1@x.com' }] });
    expect(sync.atual.dados.links).toEqual({ porSlot: { 'SLOT-001': 'https://teams/x' }, porGrupo: {} });
    expect(sync.atual.dados.avaliacoes[0]).toMatchObject({ presente: 'Não, ausente', apto: 'Não, não-apto' });
    expect(sync.atual.avaliacaoDisponivel).toBe(true);
  });

  it('script antigo (sem candidatos na resposta) desativa a avaliação sem quebrar as reservas', async () => {
    const srv = servidorFalso([{ id: 'X', timestamp: '2026-11-20T12:00:00.000Z', slotId: 'SLOT-005', nome: 'Zé Lima', email: 'ze@x.com' }]);
    const { sync } = criar(srv);
    await sync.sincronizar();
    expect(sync.atual.reservas).toHaveLength(1);
    expect(sync.atual.avaliacaoDisponivel).toBe(false);
  });

  it('modo local: salva avaliação sem duplicar e recusa quem não é da banca', async () => {
    const arm = criarArmazenamentoMemoria();
    arm.gravar(CHAVES.dadosBancas, { candidatos: { 'AL G1': [{ nome: 'C1', email: 'c1@x.com' }] }, links: { porSlot: {}, porGrupo: {} }, avaliacoes: [] });
    const sync = new Sincronizador(arm, '');
    await sync.confirmar(EU, ['SLOT-001']);
    const base = {
      timestamp: 't', slotId: 'SLOT-001', grupo: 'AL G1', candidato: 'C1', emailCandidato: 'c1@x.com',
      avaliadorEmail: 'ana@fgv.br', avaliadorNome: 'Ana Lima', presente: 'Sim, presente' as const, chaveVideo: 3,
      criterios: [1, 1, 1, 1, 1], totalPontos: 5, apto: 'Não, não-apto' as const, observacoes: '',
    };
    expect(await sync.salvarAvaliacao(base)).toEqual({ editada: false });
    expect(await sync.salvarAvaliacao({ ...base, totalPontos: 9 })).toEqual({ editada: true });
    expect(sync.atual.dados.avaliacoes).toHaveLength(1);
    await expect(sync.salvarAvaliacao({ ...base, avaliadorEmail: 'outro@x.com' })).rejects.toThrow(/Só os avaliadores/);
    expect((await sync.carregarResultados('qualquer')).avaliacoes).toHaveLength(1);
  });
});
