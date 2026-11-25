import { describe, expect, it } from 'vitest';
import {
  aplicarAvaliacao,
  APTO,
  AUSENTE,
  calcularTotal,
  chaveAvaliacao,
  filtrarRanking,
  kpisResultados,
  linkTeamsDaBanca,
  minhasBancas,
  montarAvaliacao,
  montarRanking,
  NAO_APTO,
  normalizarGrupo,
  podeAvaliar,
  PRESENTE,
  RASCUNHO_VAZIO,
  rotuloStatus,
  situacaoBanca,
  statusCandidato,
  validarRascunho,
  type Avaliacao,
  type RascunhoAvaliacao,
} from '../src/lib/avaliacao';
import type { Reserva } from '../src/lib/types';

const ctx = (email = 'c1@x.com', grupo = 'AL G1') => ({
  slotId: 'SLOT-001',
  grupo,
  candidato: { nome: 'Cand Um', email },
  avaliadorEmail: 'Ana@FGV.br',
  avaliadorNome: 'Ana Lima',
});
const completo = (criterios: number[], apto: RascunhoAvaliacao['apto'] = APTO, chave = 3): RascunhoAvaliacao => ({
  presente: PRESENTE,
  chaveVideo: chave,
  criterios,
  apto,
  observacoes: '  ok  ',
});
let t = 0;
const av = (email: string, grupo: string, r: RascunhoAvaliacao, nome = email) =>
  montarAvaliacao({ ...ctx(email, grupo), candidato: { nome, email } }, r, () => `2026-12-07T12:00:${String(t++).padStart(2, '0')}.000Z`);

describe('nota e regra do ausente', () => {
  it('soma os 5 critérios (máximo 15)', () => {
    expect(calcularTotal([3, 3, 3, 3, 3], PRESENTE)).toBe(15);
    expect(calcularTotal([1, 0, 2, null, 3], PRESENTE)).toBe(6);
  });

  it('ausente vale 0 pontos e não-apto, e as notas são descartadas', () => {
    expect(calcularTotal([3, 3, 3, 3, 3], AUSENTE)).toBe(0);
    const a = montarAvaliacao(ctx(), { ...completo([3, 3, 3, 3, 3]), presente: AUSENTE });
    expect(a).toMatchObject({ totalPontos: 0, apto: NAO_APTO, chaveVideo: null, presente: AUSENTE });
    expect(a.criterios).toEqual([null, null, null, null, null]);
  });

  it('normaliza e-mails, grupo e observações', () => {
    const a = montarAvaliacao(ctx(' C1@X.COM ', ' al  g1 '), completo([2, 2, 2, 2, 2]));
    expect(a).toMatchObject({ grupo: 'AL G1', emailCandidato: 'c1@x.com', avaliadorEmail: 'ana@fgv.br', observacoes: 'ok', totalPontos: 10 });
  });

  it('valida o formulário (ausente pode salvar direto)', () => {
    expect(validarRascunho(RASCUNHO_VAZIO)).toEqual(['Informe se o candidato estava presente.']);
    expect(validarRascunho({ ...RASCUNHO_VAZIO, presente: AUSENTE })).toEqual([]);
    const faltando = validarRascunho({ ...RASCUNHO_VAZIO, presente: PRESENTE, criterios: [3, 3, null, 4, 1] });
    expect(faltando).toHaveLength(4); // chave do vídeo, 2 critérios inválidos, parecer
    expect(validarRascunho(completo([0, 1, 2, 3, 0]))).toEqual([]);
  });
});

describe('prevenção de duplicidade (Grupo + EmailCandidato)', () => {
  it('a chave ignora maiúsculas e espaços', () => {
    expect(chaveAvaliacao(' al g1', 'C1@x.com ')).toBe(chaveAvaliacao('AL G1', 'c1@x.com'));
    expect(normalizarGrupo('  se   g23 ')).toBe('SE G23');
  });

  it('o segundo avaliador atualiza a mesma linha em vez de duplicar', () => {
    const primeira = av('c1@x.com', 'AL G1', completo([1, 1, 1, 1, 1], NAO_APTO));
    let r = aplicarAvaliacao([], primeira);
    expect(r).toMatchObject({ editada: false });
    const doColega = { ...av('C1@X.com', 'al g1', completo([3, 3, 3, 3, 2])), avaliadorNome: 'Bruno Reis' };
    r = aplicarAvaliacao(r.lista, doColega);
    expect(r.editada).toBe(true);
    expect(r.lista).toHaveLength(1);
    expect(r.lista[0]).toMatchObject({ avaliadorNome: 'Bruno Reis', totalPontos: 14, apto: APTO });
    // outro candidato do mesmo grupo é outra linha
    expect(aplicarAvaliacao(r.lista, av('c2@x.com', 'AL G1', completo([0, 0, 0, 0, 0], NAO_APTO))).lista).toHaveLength(2);
  });
});

describe('ranking consolidado', () => {
  const candidatos = {
    'AL G1': [
      { nome: 'Ana', email: 'a@x.com' },
      { nome: 'Bia', email: 'b@x.com' },
      { nome: 'Caio', email: 'c@x.com' },
    ],
    'PI G2': [
      { nome: 'Davi', email: 'd@x.com' },
      { nome: 'Eva', email: 'e@x.com' },
      { nome: 'Fábio', email: 'f@x.com' },
    ],
  };
  const avaliacoes: Avaliacao[] = [
    av('a@x.com', 'AL G1', completo([3, 3, 3, 3, 3], NAO_APTO, 4), 'Ana'), // 15 mas não-apto
    av('b@x.com', 'AL G1', completo([2, 2, 2, 2, 2], APTO, 2), 'Bia'), // 10 apto, vídeo 2
    av('d@x.com', 'PI G2', completo([2, 2, 2, 2, 2], APTO, 4), 'Davi'), // 10 apto, vídeo 4 (desempate)
    av('e@x.com', 'PI G2', { ...RASCUNHO_VAZIO, presente: AUSENTE }, 'Eva'),
    av('f@x.com', 'PI G2', completo([3, 3, 3, 3, 2], APTO, 1), 'Fábio'), // 14 apto
  ];
  const ranking = montarRanking(candidatos, avaliacoes);

  it('aptos primeiro, depois pontos (desc) e chave do vídeo (desc); pendentes no fim', () => {
    expect(ranking.map((l) => l.candidato)).toEqual(['Fábio', 'Davi', 'Bia', 'Ana', 'Eva', 'Caio']);
    expect(ranking.map((l) => l.posicao)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ranking.map((l) => l.status)).toEqual(['apto', 'apto', 'apto', 'nao-apto', 'ausente', 'pendente']);
  });

  it('indicadores e filtros', () => {
    expect(kpisResultados(ranking)).toEqual({ total: 6, avaliados: 5, pendentes: 1, presentes: 4, ausentes: 1, aptos: 3, naoAptos: 1 });
    expect(filtrarRanking(ranking, { uf: 'PI', grupo: '', status: '' })).toHaveLength(3);
    expect(filtrarRanking(ranking, { uf: '', grupo: 'al g1', status: 'pendente' }).map((l) => l.candidato)).toEqual(['Caio']);
  });

  it('mantém avaliações de candidatos que saíram da aba Candidatos', () => {
    const r = montarRanking({}, [avaliacoes[1]]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ candidato: 'Bia', uf: 'AL' });
  });

  it('rótulos dos status', () => {
    expect(rotuloStatus(undefined)).toBe('Pendente');
    expect(rotuloStatus(avaliacoes[1])).toBe('Avaliado • Apto (10/15)');
    expect(rotuloStatus(avaliacoes[0])).toBe('Avaliado • Não-apto (15/15)');
    expect(rotuloStatus(avaliacoes[3])).toBe('Ausente');
    expect(statusCandidato(avaliacoes[3])).toBe('ausente');
  });
});

describe('Minhas Bancas — antes e depois de popular a aba Candidatos', () => {
  const reservas: Reserva[] = [
    { id: '2', timestamp: 't', slotId: 'SLOT-026', nome: 'Ana Lima', email: 'ana@fgv.br' },
    { id: '1', timestamp: 't', slotId: 'SLOT-001', nome: 'Ana Lima', email: 'ANA@fgv.br' },
    { id: '3', timestamp: 't', slotId: 'SLOT-001', nome: 'Bruno', email: 'bruno@fgv.br' },
    { id: '4', timestamp: 't', slotId: 'SLOT-100', nome: 'Ana Lima', email: 'ana@fgv.br' },
  ];

  it('lista as bancas do avaliador em ordem de data e horário', () => {
    expect(minhasBancas(' ana@FGV.br', reservas).map((r) => r.slotId)).toEqual(['SLOT-001', 'SLOT-026', 'SLOT-100']);
  });

  it('antes: "aguardando"; depois: candidatos do grupo (com trim no nome do grupo)', () => {
    expect(situacaoBanca('SLOT-001', {})).toEqual({ tipo: 'aguardando', grupo: 'AL G1' });
    const depois = situacaoBanca('SLOT-001', { ' al g1 ': [{ nome: 'C', email: 'c@x.com' }] });
    expect(depois).toMatchObject({ tipo: 'pronta', grupo: 'AL G1', candidatos: [{ email: 'c@x.com' }] });
    expect(situacaoBanca('SLOT-100', { 'AL G1': [] })).toEqual({ tipo: 'livre' });
  });

  it('só avalia quem reservou a banca, e o link do Teams vem por SlotId ou por Grupo', () => {
    expect(podeAvaliar('SLOT-001', 'AL G1', 'bruno@fgv.br', reservas)).toBe(true);
    expect(podeAvaliar('SLOT-001', 'AL G1', 'intruso@fgv.br', reservas)).toBe(false);
    expect(podeAvaliar('SLOT-001', 'PI G6', 'ana@fgv.br', reservas)).toBe(false);
    expect(linkTeamsDaBanca('SLOT-001', { porSlot: {}, porGrupo: { 'AL G1': 'https://teams/g' } })).toBe('https://teams/g');
    expect(linkTeamsDaBanca('SLOT-001', { porSlot: { 'SLOT-001': 'https://teams/s' }, porGrupo: { 'AL G1': 'https://teams/g' } })).toBe(
      'https://teams/s',
    );
  });
});
