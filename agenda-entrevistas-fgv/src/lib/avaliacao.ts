/**
 * Avaliação de candidatos nas bancas ("Minhas Bancas") e ranking da coordenação.
 * A mesma lógica é espelhada no scripts/Code.gs (salvarAvaliacao_).
 */
import { SLOT_POR_ID } from '../data/grade';
import { normalizarEmail } from './regras';
import type { Reserva, Slot } from './types';

export const PRESENTE = 'Sim, presente';
export const AUSENTE = 'Não, ausente';
export const APTO = 'Sim, apto';
export const NAO_APTO = 'Não, não-apto';

export type Presenca = typeof PRESENTE | typeof AUSENTE;
export type Parecer = typeof APTO | typeof NAO_APTO;

export const CRITERIOS = [
  { coluna: 'Crit1_AnalisePedagogica', titulo: 'Análise pedagógica e tomada de decisão' },
  { coluna: 'Crit2_Argumentacao', titulo: 'Argumentação e comunicação' },
  { coluna: 'Crit3_MediacaoEscuta', titulo: 'Mediação e escuta' },
  { coluna: 'Crit4_CoerenciaCNCA', titulo: 'Coerência com princípios do CNCA' },
  { coluna: 'Crit5_PosturaColaboracao', titulo: 'Postura profissional e colaboração' },
] as const;

export const NOTA_MAX_CRITERIO = 3;
export const PONTUACAO_MAXIMA = CRITERIOS.length * NOTA_MAX_CRITERIO; // 15

export const CHAVES_VIDEO = [
  { valor: 1, rotulo: 'Insatisfatório' },
  { valor: 2, rotulo: 'Regular' },
  { valor: 3, rotulo: 'Bom' },
  { valor: 4, rotulo: 'Superior' },
] as const;

/** Colunas da aba "Avaliacoes" (mesma ordem do Code.gs). */
export const COLUNAS_AVALIACOES = [
  'Timestamp',
  'SlotId',
  'Grupo',
  'Candidato',
  'EmailCandidato',
  'AvaliadorEmail',
  'AvaliadorNome',
  'Presente',
  'ChaveVideo',
  ...CRITERIOS.map((c) => c.coluna),
  'TotalPontos',
  'Apto',
  'Observacoes',
] as const;

export interface Candidato {
  nome: string;
  email: string;
}

/** Candidatos por grupo normalizado ("AL G1" → [...]) */
export type MapaCandidatos = Record<string, Candidato[]>;

export interface LinksTeams {
  porSlot: Record<string, string>;
  porGrupo: Record<string, string>;
}

export interface Avaliacao {
  timestamp: string;
  slotId: string;
  grupo: string;
  candidato: string;
  emailCandidato: string;
  avaliadorEmail: string;
  avaliadorNome: string;
  presente: Presenca;
  chaveVideo: number | null;
  criterios: (number | null)[]; // 5 notas de 0 a 3
  totalPontos: number;
  apto: Parecer;
  observacoes: string;
}

export interface DadosBancas {
  candidatos: MapaCandidatos;
  links: LinksTeams;
  avaliacoes: Avaliacao[];
}

export const DADOS_VAZIOS: DadosBancas = { candidatos: {}, links: { porSlot: {}, porGrupo: {} }, avaliacoes: [] };

// ---------------------------------------------------------------------------
// Normalização e chaves
// ---------------------------------------------------------------------------

/** " al  g1 " → "AL G1" */
export function normalizarGrupo(grupo: string): string {
  return String(grupo ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Chave única da avaliação: Grupo + EmailCandidato, normalizados (trim + minúsculas). */
export function chaveAvaliacao(grupo: string, emailCandidato: string): string {
  return `${normalizarGrupo(grupo).toLowerCase()}|${String(emailCandidato ?? '').trim().toLowerCase()}`;
}

export function grupoDoSlot(slotId: string): string {
  const s = SLOT_POR_ID[slotId];
  return s && s.estado !== 'LIVRE' ? normalizarGrupo(s.rotulo) : '';
}

export function ufDoGrupo(grupo: string): string {
  return normalizarGrupo(grupo).split(' ')[0] ?? '';
}

// ---------------------------------------------------------------------------
// Nota e regra do candidato ausente
// ---------------------------------------------------------------------------

export function calcularTotal(criterios: (number | null)[], presente: Presenca | ''): number {
  if (presente === AUSENTE) return 0;
  return criterios.reduce<number>((soma, n) => soma + (typeof n === 'number' && Number.isFinite(n) ? n : 0), 0);
}

export interface RascunhoAvaliacao {
  presente: Presenca | '';
  chaveVideo: number | null;
  criterios: (number | null)[];
  apto: Parecer | '';
  observacoes: string;
}

export const RASCUNHO_VAZIO: RascunhoAvaliacao = {
  presente: '',
  chaveVideo: null,
  criterios: CRITERIOS.map(() => null),
  apto: '',
  observacoes: '',
};

export function rascunhoDe(av?: Avaliacao): RascunhoAvaliacao {
  if (!av) return { ...RASCUNHO_VAZIO, criterios: [...RASCUNHO_VAZIO.criterios] };
  return {
    presente: av.presente,
    chaveVideo: av.chaveVideo,
    criterios: CRITERIOS.map((_, i) => av.criterios[i] ?? null),
    apto: av.presente === AUSENTE ? '' : av.apto,
    observacoes: av.observacoes ?? '',
  };
}

/** Lista de pendências do formulário (vazia = pode salvar). */
export function validarRascunho(r: RascunhoAvaliacao): string[] {
  const erros: string[] = [];
  if (r.presente !== PRESENTE && r.presente !== AUSENTE) erros.push('Informe se o candidato estava presente.');
  if (r.presente !== PRESENTE) return erros;
  if (!CHAVES_VIDEO.some((c) => c.valor === r.chaveVideo)) erros.push('Escolha a chave de correção do vídeo (1 a 4).');
  CRITERIOS.forEach((c, i) => {
    const n = r.criterios[i];
    if (typeof n !== 'number' || n < 0 || n > NOTA_MAX_CRITERIO || !Number.isInteger(n)) {
      erros.push(`Dê uma nota de 0 a 3 em "${c.titulo}".`);
    }
  });
  if (r.apto !== APTO && r.apto !== NAO_APTO) erros.push('Informe o parecer final (apto ou não-apto).');
  return erros;
}

export interface ContextoAvaliacao {
  slotId: string;
  grupo: string;
  candidato: Candidato;
  avaliadorEmail: string;
  avaliadorNome: string;
}

/** Monta a avaliação final aplicando a regra do ausente (0 pontos, não-apto, notas limpas). */
export function montarAvaliacao(
  ctx: ContextoAvaliacao,
  r: RascunhoAvaliacao,
  agora: () => string = () => new Date().toISOString(),
): Avaliacao {
  const ausente = r.presente === AUSENTE;
  const criterios = ausente ? CRITERIOS.map(() => null) : CRITERIOS.map((_, i) => r.criterios[i] ?? null);
  return {
    timestamp: agora(),
    slotId: ctx.slotId,
    grupo: normalizarGrupo(ctx.grupo),
    candidato: ctx.candidato.nome.trim(),
    emailCandidato: normalizarEmail(ctx.candidato.email),
    avaliadorEmail: normalizarEmail(ctx.avaliadorEmail),
    avaliadorNome: ctx.avaliadorNome.trim(),
    presente: ausente ? AUSENTE : PRESENTE,
    chaveVideo: ausente ? null : r.chaveVideo,
    criterios,
    totalPontos: calcularTotal(criterios, r.presente),
    apto: ausente ? NAO_APTO : (r.apto as Parecer),
    observacoes: r.observacoes.trim(),
  };
}

/** Insere ou atualiza (modo edição) pela chave Grupo + EmailCandidato — nunca duplica. */
export function aplicarAvaliacao(lista: Avaliacao[], nova: Avaliacao): { lista: Avaliacao[]; editada: boolean } {
  const chave = chaveAvaliacao(nova.grupo, nova.emailCandidato);
  const idx = lista.findIndex((a) => chaveAvaliacao(a.grupo, a.emailCandidato) === chave);
  if (idx < 0) return { lista: [...lista, nova], editada: false };
  const copia = [...lista];
  copia[idx] = nova;
  return { lista: copia, editada: true };
}

/** Índice chave → avaliação (se houver duplicatas antigas, a mais recente vence). */
export function indexarAvaliacoes(lista: Avaliacao[]): Map<string, Avaliacao> {
  const mapa = new Map<string, Avaliacao>();
  for (const a of lista) {
    const k = chaveAvaliacao(a.grupo, a.emailCandidato);
    const atual = mapa.get(k);
    if (!atual || a.timestamp >= atual.timestamp) mapa.set(k, a);
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// Status do candidato
// ---------------------------------------------------------------------------

export type StatusCandidato = 'pendente' | 'apto' | 'nao-apto' | 'ausente';

export function statusCandidato(av?: Avaliacao): StatusCandidato {
  if (!av) return 'pendente';
  if (av.presente === AUSENTE) return 'ausente';
  return av.apto === APTO ? 'apto' : 'nao-apto';
}

export function rotuloStatus(av?: Avaliacao): string {
  const st = statusCandidato(av);
  if (st === 'pendente') return 'Pendente';
  if (st === 'ausente') return 'Ausente';
  return `Avaliado • ${st === 'apto' ? 'Apto' : 'Não-apto'} (${av!.totalPontos}/${PONTUACAO_MAXIMA})`;
}

// ---------------------------------------------------------------------------
// Minhas Bancas
// ---------------------------------------------------------------------------

export function candidatosDoGrupo(grupo: string, mapa: MapaCandidatos): Candidato[] {
  const alvo = normalizarGrupo(grupo);
  if (!alvo) return [];
  const lista: Candidato[] = [];
  for (const [g, cs] of Object.entries(mapa)) if (normalizarGrupo(g) === alvo) lista.push(...cs);
  return lista;
}

export type SituacaoBanca =
  | { tipo: 'livre' } // banca sem grupo de candidatos
  | { tipo: 'aguardando'; grupo: string } // aba Candidatos ainda sem esse grupo
  | { tipo: 'pronta'; grupo: string; candidatos: Candidato[] };

/** Antes vs. depois de popular a aba Candidatos. */
export function situacaoBanca(slotId: string, mapa: MapaCandidatos): SituacaoBanca {
  const grupo = grupoDoSlot(slotId);
  if (!grupo) return { tipo: 'livre' };
  const candidatos = candidatosDoGrupo(grupo, mapa);
  return candidatos.length > 0 ? { tipo: 'pronta', grupo, candidatos } : { tipo: 'aguardando', grupo };
}

/** Reservas confirmadas do avaliador, em ordem de data e horário. */
export function minhasBancas(email: string, reservas: Reserva[]): Reserva[] {
  const e = normalizarEmail(email);
  if (!e) return [];
  return reservas.filter((r) => normalizarEmail(r.email) === e).sort((a, b) => a.slotId.localeCompare(b.slotId));
}

export function colegasDaBanca(slotId: string, email: string, reservas: Reserva[]): Reserva[] {
  const e = normalizarEmail(email);
  return reservas.filter((r) => r.slotId === slotId && normalizarEmail(r.email) !== e);
}

export function linkTeamsDaBanca(slotId: string, links: LinksTeams): string {
  return links.porSlot[slotId] || links.porGrupo[grupoDoSlot(slotId)] || '';
}

/** O avaliador só pode avaliar candidatos do grupo de uma banca que ele reservou. */
export function podeAvaliar(slotId: string, grupo: string, emailAvaliador: string, reservas: Reserva[]): boolean {
  const s: Slot | undefined = SLOT_POR_ID[slotId];
  if (!s || grupoDoSlot(slotId) !== normalizarGrupo(grupo)) return false;
  return minhasBancas(emailAvaliador, reservas).some((r) => r.slotId === slotId);
}

// ---------------------------------------------------------------------------
// Resultados & Ranking
// ---------------------------------------------------------------------------

export interface LinhaRanking {
  posicao: number;
  grupo: string;
  uf: string;
  candidato: string;
  emailCandidato: string;
  status: StatusCandidato;
  avaliacao?: Avaliacao;
}

function pesoStatus(l: Omit<LinhaRanking, 'posicao'>): number {
  if (l.status === 'apto') return 0;
  if (l.status === 'nao-apto') return 1;
  if (l.status === 'ausente') return 2;
  return 3; // pendente
}

/**
 * Ranking consolidado: (1) "Sim, apto" primeiro, (2) TotalPontos decrescente,
 * (3) ChaveVideo decrescente como desempate. Pendentes ficam no fim.
 */
export function montarRanking(candidatos: MapaCandidatos, avaliacoes: Avaliacao[]): LinhaRanking[] {
  const indice = indexarAvaliacoes(avaliacoes);
  const vistos = new Set<string>();
  const linhas: Omit<LinhaRanking, 'posicao'>[] = [];

  for (const [g, lista] of Object.entries(candidatos)) {
    for (const c of lista) {
      const k = chaveAvaliacao(g, c.email);
      if (vistos.has(k)) continue;
      vistos.add(k);
      const av = indice.get(k);
      linhas.push({
        grupo: normalizarGrupo(g),
        uf: ufDoGrupo(g),
        candidato: c.nome,
        emailCandidato: normalizarEmail(c.email),
        status: statusCandidato(av),
        avaliacao: av,
      });
    }
  }
  // Avaliações de candidatos que saíram da aba Candidatos continuam no ranking.
  for (const [k, av] of indice) {
    if (vistos.has(k)) continue;
    linhas.push({
      grupo: av.grupo,
      uf: ufDoGrupo(av.grupo),
      candidato: av.candidato,
      emailCandidato: av.emailCandidato,
      status: statusCandidato(av),
      avaliacao: av,
    });
  }

  linhas.sort(
    (a, b) =>
      pesoStatus(a) - pesoStatus(b) ||
      (b.avaliacao?.totalPontos ?? -1) - (a.avaliacao?.totalPontos ?? -1) ||
      (b.avaliacao?.chaveVideo ?? 0) - (a.avaliacao?.chaveVideo ?? 0) ||
      a.grupo.localeCompare(b.grupo, 'pt-BR', { numeric: true }) ||
      a.candidato.localeCompare(b.candidato, 'pt-BR'),
  );
  return linhas.map((l, i) => ({ ...l, posicao: i + 1 }));
}

export interface FiltrosRanking {
  uf: string;
  grupo: string;
  status: StatusCandidato | '';
}

export function filtrarRanking(linhas: LinhaRanking[], f: FiltrosRanking): LinhaRanking[] {
  return linhas.filter(
    (l) =>
      (!f.uf || l.uf === f.uf) &&
      (!f.grupo || l.grupo === normalizarGrupo(f.grupo)) &&
      (!f.status || l.status === f.status),
  );
}

export interface KpisResultados {
  total: number;
  avaliados: number;
  pendentes: number;
  presentes: number;
  ausentes: number;
  aptos: number;
  naoAptos: number;
}

export function kpisResultados(linhas: LinhaRanking[]): KpisResultados {
  const conta = (s: StatusCandidato) => linhas.filter((l) => l.status === s).length;
  const aptos = conta('apto');
  const naoAptos = conta('nao-apto');
  const ausentes = conta('ausente');
  return {
    total: linhas.length,
    avaliados: aptos + naoAptos + ausentes,
    pendentes: conta('pendente'),
    presentes: aptos + naoAptos,
    ausentes,
    aptos,
    naoAptos,
  };
}
