/**
 * Executa o scripts/Code.gs de verdade, num sandbox com SpreadsheetApp,
 * LockService, ContentService etc. simulados em memória.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

type Linha = unknown[];

function criarPlanilha() {
  const abas: Record<string, { linhas: Linha[] }> = {};
  const aba = (nome: string) => {
    const dados = { linhas: [] as Linha[] };
    abas[nome] = dados;
    const sh = {
      getName: () => nome,
      getLastRow: () => dados.linhas.length,
      getLastColumn: () => dados.linhas.reduce((m, l) => Math.max(m, l.length), 0),
      appendRow: (r: Linha) => dados.linhas.push([...r]),
      setFrozenRows() {},
      deleteRow: (i: number) => dados.linhas.splice(i - 1, 1),
      getRange: (r: number, c: number, n = 1, w = 1) => ({
        setFontWeight() { return this; },
        setBackground() { return this; },
        setFontColor() { return this; },
        setNumberFormat() { return this; },
        getValues: () =>
          dados.linhas.slice(r - 1, r - 1 + n).map((l) => Array.from({ length: w }, (_, k) => l[c - 1 + k] ?? '')),
        setValues: (v: Linha[]) =>
          v.forEach((row, i) => {
            const l = (dados.linhas[r - 1 + i] ||= []);
            row.forEach((x, k) => (l[c - 1 + k] = x));
          }),
        setFormulas: (v: Linha[]) =>
          v.forEach((row, i) => {
            const l = (dados.linhas[r - 1 + i] ||= []);
            l[c - 1] = row[0];
          }),
        clearContent: () => {
          for (let i = 0; i < n; i++) if (dados.linhas[r - 1 + i]) dados.linhas[r - 1 + i] = [];
        },
      }),
    };
    return sh;
  };
  const sheets: Record<string, ReturnType<typeof aba>> = {};
  return {
    abas,
    ss: {
      getSheetByName: (n: string) => sheets[n] ?? null,
      insertSheet: (n: string) => (sheets[n] = aba(n)),
    },
  };
}

function carregarCodeGs(props: Record<string, string> = {}) {
  const planilha = criarPlanilha();
  let uuid = 0;
  const sandbox: Record<string, unknown> = {
    SpreadsheetApp: { getActiveSpreadsheet: () => planilha.ss, flush() {}, getUi: () => ({}) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (t: string) => ({ setMimeType: () => ({ texto: t }) }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail() {} },
    Utilities: { getUuid: () => `u${++uuid}` },
    Logger: { log() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(resolve(__dirname, '../scripts/Code.gs'), 'utf8'), sandbox);
  const chamar = (fn: string, arg: unknown) => {
    const r = (sandbox[fn] as (a: unknown) => { texto: string })(arg);
    return JSON.parse(r.texto);
  };
  return {
    abas: planilha.abas,
    sandbox,
    post: (corpo: unknown) => chamar('doPost', { postData: { contents: JSON.stringify(corpo) } }),
    get: (parametros: Record<string, string>) => chamar('doGet', { parameter: parametros }),
  };
}

const ficha = (extra: Record<string, unknown> = {}) => ({
  slotId: 'SLOT-001',
  grupo: 'AL G1',
  emailCandidato: 'cand1@x.com',
  avaliadorEmail: 'ana@fgv.br',
  avaliadorNome: 'Ana Lima',
  presente: 'Sim, presente',
  chaveVideo: 3,
  criterios: [3, 2, 3, 2, 3],
  apto: 'Sim, apto',
  observacoes: 'Muito bem',
  ...extra,
});

describe('scripts/Code.gs — avaliações', () => {
  let gs: ReturnType<typeof carregarCodeGs>;

  beforeEach(() => {
    gs = carregarCodeGs({ ADMIN_TOKEN: 'segredo' });
    (gs.sandbox.configurar as () => void)();
    // Candidatos com espaços/maiúsculas variados: o script normaliza com trim.
    const cand = gs.abas.Candidatos.linhas;
    cand.push(['  al g1 ', 'Cand Um', ' CAND1@x.com '], ['AL G1', 'Cand Dois', 'cand2@x.com'], ['PI G1', 'Outro', 'pi@x.com']);
    gs.post({ action: 'reserve', nome: 'Ana Lima', email: 'ana@fgv.br', slotIds: ['SLOT-001'] });
    gs.post({ action: 'reserve', nome: 'Bruno Reis', email: 'bruno@fgv.br', slotIds: ['SLOT-001'] });
  });

  it('cria as abas gerenciadas com os cabeçalhos', () => {
    expect(gs.abas.Avaliacoes.linhas[0]).toEqual([
      'Timestamp', 'SlotId', 'Grupo', 'Candidato', 'EmailCandidato', 'AvaliadorEmail', 'AvaliadorNome', 'Presente',
      'ChaveVideo', 'Crit1_AnalisePedagogica', 'Crit2_Argumentacao', 'Crit3_MediacaoEscuta', 'Crit4_CoerenciaCNCA',
      'Crit5_PosturaColaboracao', 'TotalPontos', 'Apto', 'Observacoes',
    ]);
    expect(gs.abas.Candidatos.linhas[0]).toEqual(['Grupo', 'Nome', 'Email']);
    expect(gs.abas.Teams_Links.linhas[0]).toEqual(['SlotId', 'Grupo', 'LinkTeams']);
  });

  it('grava a avaliação com total calculado no servidor', () => {
    const r = gs.post({ action: 'salvarAvaliacao', avaliacao: ficha({ criterios: [3, 3, 3, 3, 3], totalPontos: 999 }) });
    expect(r).toMatchObject({ ok: true, editada: false, avaliacao: { totalPontos: 15, grupo: 'AL G1', candidato: 'Cand Um' } });
    const linha = gs.abas.Avaliacoes.linhas[1];
    expect(linha.slice(1, 9)).toEqual(['SLOT-001', 'AL G1', 'Cand Um', 'cand1@x.com', 'ana@fgv.br', 'Ana Lima', 'Sim, presente', 3]);
    expect(linha.slice(9)).toEqual([3, 3, 3, 3, 3, 15, 'Sim, apto', 'Muito bem']);
  });

  it('o 2º avaliador EDITA a mesma linha (chave Grupo + EmailCandidato), sem duplicar', () => {
    gs.post({ action: 'salvarAvaliacao', avaliacao: ficha() });
    const r = gs.post({
      action: 'salvarAvaliacao',
      avaliacao: ficha({ emailCandidato: ' Cand1@X.com ', grupo: 'al g1', avaliadorEmail: 'bruno@fgv.br', avaliadorNome: 'Bruno Reis', criterios: [1, 1, 1, 1, 1], apto: 'Não, não-apto' }),
    });
    expect(r).toMatchObject({ ok: true, editada: true });
    expect(gs.abas.Avaliacoes.linhas).toHaveLength(2); // cabeçalho + 1
    expect(gs.abas.Avaliacoes.linhas[1].slice(5, 7)).toEqual(['bruno@fgv.br', 'Bruno Reis']);
    expect(gs.abas.Avaliacoes.linhas[1][14]).toBe(5);
    // outro candidato do grupo vira outra linha
    gs.post({ action: 'salvarAvaliacao', avaliacao: ficha({ emailCandidato: 'cand2@x.com' }) });
    expect(gs.abas.Avaliacoes.linhas).toHaveLength(3);
  });

  it('candidato ausente: TotalPontos = 0 e "Não, não-apto", mesmo com notas enviadas', () => {
    const r = gs.post({ action: 'salvarAvaliacao', avaliacao: ficha({ presente: 'Não, ausente', apto: 'Sim, apto' }) });
    expect(r.avaliacao).toMatchObject({ totalPontos: 0, apto: 'Não, não-apto', chaveVideo: null });
    expect(gs.abas.Avaliacoes.linhas[1].slice(8)).toEqual(['', '', '', '', '', '', 0, 'Não, não-apto', 'Muito bem']);
  });

  it('valida notas, banca e permissões', () => {
    expect(gs.post({ action: 'salvarAvaliacao', avaliacao: ficha({ criterios: [3, 3, 3, 3, 4] }) }).ok).toBe(false);
    expect(gs.post({ action: 'salvarAvaliacao', avaliacao: ficha({ chaveVideo: 5 }) }).ok).toBe(false);
    expect(gs.post({ action: 'salvarAvaliacao', avaliacao: ficha({ avaliadorEmail: 'intruso@x.com' }) }).error).toMatch(/Só os avaliadores/);
    expect(gs.post({ action: 'salvarAvaliacao', avaliacao: ficha({ emailCandidato: 'pi@x.com' }) }).error).toMatch(/não encontrado/);
    expect(gs.abas.Avaliacoes.linhas).toHaveLength(1);
  });

  it('GET list devolve só os dados dos grupos do avaliador; Teams_Links por SlotId ou Grupo', () => {
    gs.abas.Teams_Links.linhas.push(['', ' al g1', 'https://teams.microsoft.com/l/abc'], ['SLOT-021', 'PI G1', 'https://teams.microsoft.com/l/pi']);
    gs.post({ action: 'salvarAvaliacao', avaliacao: ficha() });
    const ana = gs.get({ action: 'list', email: 'ANA@fgv.br' });
    expect(ana.reservas).toHaveLength(2);
    expect(Object.keys(ana.candidatos)).toEqual(['AL G1']);
    expect(ana.candidatos['AL G1'].map((c: { email: string }) => c.email)).toEqual(['cand1@x.com', 'cand2@x.com']);
    expect(ana.links.porGrupo).toEqual({ 'AL G1': 'https://teams.microsoft.com/l/abc' });
    expect(ana.links.porSlot).toEqual({});
    expect(ana.avaliacoes).toHaveLength(1);
    const anonimo = gs.get({ action: 'list' });
    expect(anonimo).toMatchObject({ candidatos: {}, avaliacoes: [] });
  });

  it('resultados (ranking) exigem ADMIN_TOKEN', () => {
    gs.post({ action: 'salvarAvaliacao', avaliacao: ficha() });
    expect(gs.post({ action: 'resultados', token: 'errado' })).toMatchObject({ ok: false, error: 'Não autorizado.' });
    const r = gs.post({ action: 'resultados', token: 'segredo' });
    expect(Object.keys(r.candidatos).sort()).toEqual(['AL G1', 'PI G1']);
    expect(r.avaliacoes).toHaveLength(1);
    const semToken = carregarCodeGs({});
    expect(semToken.post({ action: 'resultados', token: 'x' }).error).toMatch(/ADMIN_TOKEN/);
  });

  it('o fluxo de reservas continua intacto (capacidade 2/2)', () => {
    const r = gs.post({ action: 'reserve', nome: 'Caio Souza', email: 'caio@fgv.br', slotIds: ['SLOT-001'] });
    expect(r.rejeitadas).toEqual([{ slotId: 'SLOT-001', motivo: 'lotada' }]);
  });
});

describe('scripts/Code.gs — e-mail da reserva com espaços', () => {
  it('o avaliador recebe os candidatos mesmo se a reserva foi editada à mão com espaço/maiúscula', () => {
    const gs = carregarCodeGs({ ADMIN_TOKEN: 'segredo' });
    (gs.sandbox.configurar as () => void)();
    gs.abas.Candidatos.linhas.push(['AL G1', 'Cand Um', 'cand1@x.com']);
    gs.post({ action: 'reserve', nome: 'Ana Lima', email: 'ana@fgv.br', slotIds: ['SLOT-001'] });
    gs.abas.Reservas.linhas.push(['R-manual', new Date(), 'SLOT-001', '07/12', 'segunda', '09h00-10h00', 'A', 'AL', 'G1', 'Bruno Reis', ' Bruno@FGV.br ']);
    const bruno = gs.get({ action: 'list', email: 'bruno@fgv.br' });
    expect(bruno.candidatos['AL G1']).toHaveLength(1);
    const ana = gs.get({ action: 'list', email: 'ana@fgv.br' });
    expect(ana.candidatos['AL G1']).toHaveLength(1);
    expect(gs.post({ action: 'salvarAvaliacao', avaliacao: { ...ficha(), avaliadorEmail: 'bruno@fgv.br' } }).ok).toBe(true);
  });
});
