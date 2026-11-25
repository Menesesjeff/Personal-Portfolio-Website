import { useState } from 'react';
import { DIA_POR_ID, FAIXA_POR_ID, SLOT_POR_ID } from '../data/grade';
import {
  APTO,
  AUSENTE,
  calcularTotal,
  CHAVES_VIDEO,
  chaveAvaliacao,
  colegasDaBanca,
  CRITERIOS,
  indexarAvaliacoes,
  linkTeamsDaBanca,
  minhasBancas,
  montarAvaliacao,
  NAO_APTO,
  NOTA_MAX_CRITERIO,
  PONTUACAO_MAXIMA,
  PRESENTE,
  rascunhoDe,
  rotuloStatus,
  situacaoBanca,
  statusCandidato,
  validarRascunho,
  type Avaliacao,
  type Candidato,
  type DadosBancas,
  type RascunhoAvaliacao,
  type StatusCandidato,
} from '../lib/avaliacao';
import { normalizarEmail } from '../lib/regras';
import type { Participante, Reserva } from '../lib/types';

export const AVISO_AGUARDANDO =
  'Os candidatos deste grupo aparecerão aqui automaticamente após o fechamento do lote pela coordenação.';

const COR_STATUS: Record<StatusCandidato, string> = {
  pendente: 'bg-slate-100 text-slate-600 ring-slate-300',
  apto: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  'nao-apto': 'bg-red-50 text-red-700 ring-red-200',
  ausente: 'bg-amber-50 text-amber-800 ring-amber-300',
};

export function BadgeAvaliacao({ avaliacao }: { avaliacao?: Avaliacao }) {
  const st = statusCandidato(avaliacao);
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ${COR_STATUS[st]}`}>
      {rotuloStatus(avaliacao)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Botões de opção (segmentados)
// ---------------------------------------------------------------------------
function Opcao({
  ativo,
  onClick,
  disabled,
  children,
  tom = 'marinho',
  rotulo,
}: {
  ativo: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  tom?: 'marinho' | 'verde' | 'vermelho' | 'ambar';
  rotulo?: string;
}) {
  const cores = {
    marinho: 'bg-fgv-marinho text-white ring-fgv-marinho',
    verde: 'bg-emerald-600 text-white ring-emerald-600',
    vermelho: 'bg-red-600 text-white ring-red-600',
    ambar: 'bg-amber-500 text-white ring-amber-500',
  };
  return (
    <button
      type="button"
      aria-pressed={ativo}
      aria-label={rotulo}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
        ativo ? cores[tom] : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 flex items-center gap-2 text-sm font-bold text-fgv-marinho">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fgv-marinho text-[11px] text-white">{n}</span>
        {titulo}
      </legend>
      {children}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Ficha de avaliação (rubrica inline)
// ---------------------------------------------------------------------------
export function FichaAvaliacao({
  inicial,
  aoSalvar,
  aoCancelar,
}: {
  inicial: RascunhoAvaliacao;
  aoSalvar: (r: RascunhoAvaliacao) => Promise<void>;
  aoCancelar: () => void;
}) {
  const [r, setR] = useState<RascunhoAvaliacao>(inicial);
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const ausente = r.presente === AUSENTE;
  const total = calcularTotal(r.criterios, r.presente);
  const erros = validarRascunho(r);

  const salvar = async () => {
    setTentou(true);
    setErroEnvio(null);
    if (erros.length > 0) return;
    setSalvando(true);
    try {
      await aoSalvar(r);
    } catch (e) {
      setErroEnvio(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  const setNota = (i: number, n: number) => setR((x) => ({ ...x, criterios: x.criterios.map((v, k) => (k === i ? n : v)) }));

  return (
    <div className="space-y-5 border-t border-slate-200 bg-slate-50/70 px-3 py-4 sm:px-4">
      <Passo n={1} titulo="Estava presente?">
        <div className="flex flex-wrap gap-2">
          <Opcao ativo={r.presente === PRESENTE} tom="verde" onClick={() => setR({ ...r, presente: PRESENTE })}>
            Sim, presente
          </Opcao>
          <Opcao ativo={ausente} tom="ambar" onClick={() => setR({ ...r, presente: AUSENTE })}>
            Não, ausente
          </Opcao>
        </div>
        {ausente && (
          <p className="text-xs text-amber-800">Candidato ausente: será registrado com 0 pontos e como não-apto.</p>
        )}
      </Passo>

      <Passo n={2} titulo="Chave de correção do vídeo">
        <div className="grid grid-cols-4 gap-2">
          {CHAVES_VIDEO.map((c) => (
            <Opcao
              key={c.valor}
              ativo={!ausente && r.chaveVideo === c.valor}
              disabled={ausente}
              onClick={() => setR({ ...r, chaveVideo: c.valor })}
              rotulo={`Chave ${c.valor} — ${c.rotulo}`}
            >
              <span className="block text-base leading-none font-extrabold">{c.valor}</span>
              <span className="mt-0.5 block text-[10px] font-medium opacity-80">{c.rotulo}</span>
            </Opcao>
          ))}
        </div>
      </Passo>

      <Passo n={3} titulo="Avaliação do candidato — critérios (0 a 3)">
        <div className="space-y-2">
          {CRITERIOS.map((c, i) => (
            <div key={c.coluna} className="flex flex-col gap-1.5 rounded-lg bg-white p-2.5 ring-1 ring-slate-200 sm:flex-row sm:items-center">
              <span className="flex-1 text-sm text-slate-700">{c.titulo}</span>
              <div className="flex gap-1.5" role="group" aria-label={c.titulo}>
                {Array.from({ length: NOTA_MAX_CRITERIO + 1 }, (_, n) => (
                  <Opcao
                    key={n}
                    ativo={!ausente && r.criterios[i] === n}
                    disabled={ausente}
                    onClick={() => setNota(i, n)}
                    rotulo={`${c.titulo}: nota ${n}`}
                  >
                    <span className="inline-block w-5 tabular-nums">{n}</span>
                  </Opcao>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-right text-sm font-bold text-fgv-marinho" aria-live="polite">
          Total: <span className="tabular-nums">{total}</span> / {PONTUACAO_MAXIMA} pts
        </p>
      </Passo>

      <Passo n={4} titulo="Parecer final">
        <p className="text-sm text-slate-600">Vocês consideram o candidato apto para ser formador(a)?</p>
        <div className="flex flex-wrap gap-2">
          <Opcao ativo={!ausente && r.apto === APTO} disabled={ausente} tom="verde" onClick={() => setR({ ...r, apto: APTO })}>
            Sim, apto
          </Opcao>
          <Opcao
            ativo={ausente || r.apto === NAO_APTO}
            disabled={ausente}
            tom="vermelho"
            onClick={() => setR({ ...r, apto: NAO_APTO })}
          >
            Não, não-apto
          </Opcao>
        </div>
      </Passo>

      <Passo n={5} titulo="Observações">
        <textarea
          value={r.observacoes}
          onChange={(e) => setR({ ...r, observacoes: e.target.value })}
          rows={3}
          placeholder="Comentários sobre o desempenho do candidato (opcional)"
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-fgv-azul focus:ring-2 focus:ring-sky-200"
        />
      </Passo>

      {tentou && erros.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-lg bg-amber-50 py-2 pr-3 pl-7 text-xs text-amber-900" role="alert">
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {erroEnvio && (
        <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700" role="alert">
          Não foi possível salvar: {erroEnvio}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={aoCancelar}
          disabled={salvando}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando || (tentou && erros.length > 0)}
          className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
        >
          {salvando ? 'Salvando…' : 'Salvar Avaliação'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cartão do candidato
// ---------------------------------------------------------------------------
function CartaoCandidato({
  candidato,
  avaliacao,
  meuEmail,
  aoSalvar,
}: {
  candidato: Candidato;
  avaliacao?: Avaliacao;
  meuEmail: string;
  aoSalvar: (r: RascunhoAvaliacao) => Promise<boolean>;
}) {
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const porMim = avaliacao && normalizarEmail(avaliacao.avaliadorEmail) === normalizarEmail(meuEmail);

  return (
    <li className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200" data-candidato={candidato.email}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{candidato.nome || candidato.email}</p>
          <p className="truncate text-xs text-slate-500">{candidato.email}</p>
          {avaliacao && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              {porMim ? 'Avaliado por você' : `Avaliado por ${avaliacao.avaliadorNome || avaliacao.avaliadorEmail}`}
            </p>
          )}
        </div>
        <BadgeAvaliacao avaliacao={avaliacao} />
        {!aberto && (
          <button
            type="button"
            onClick={() => {
              setAviso(null);
              setAberto(true);
            }}
            aria-expanded={aberto}
            className={`ml-auto rounded-lg px-3 py-1.5 text-xs font-bold sm:ml-0 ${
              avaliacao ? 'text-fgv-azul ring-1 ring-fgv-azul/40 hover:bg-sky-50' : 'bg-fgv-marinho text-white hover:bg-fgv-azul'
            }`}
          >
            {avaliacao ? 'Editar Avaliação' : 'Avaliar'}
          </button>
        )}
      </div>
      {aviso && !aberto && <p className="px-4 pb-2 text-xs font-semibold text-emerald-700">{aviso}</p>}
      {aberto && (
        <>
          {avaliacao && !porMim && (
            <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              Esta ficha já foi preenchida por <strong>{avaliacao.avaliadorNome || avaliacao.avaliadorEmail}</strong>. Ao salvar,
              ela será <strong>atualizada</strong> (não duplicada).
            </p>
          )}
          <FichaAvaliacao
            inicial={rascunhoDe(avaliacao)}
            aoCancelar={() => setAberto(false)}
            aoSalvar={async (r) => {
              const editada = await aoSalvar(r);
              setAberto(false);
              setAviso(editada ? '✓ Avaliação atualizada.' : '✓ Avaliação salva.');
            }}
          />
        </>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Cartão da banca
// ---------------------------------------------------------------------------
function CartaoMinhaBanca({
  reserva,
  reservas,
  dados,
  participante,
  aoSalvar,
}: {
  reserva: Reserva;
  reservas: Reserva[];
  dados: DadosBancas;
  participante: Participante;
  aoSalvar: (av: Avaliacao) => Promise<{ editada: boolean }>;
}) {
  const s = SLOT_POR_ID[reserva.slotId];
  const dia = DIA_POR_ID[s.diaId];
  const situacao = situacaoBanca(s.id, dados.candidatos);
  const colegas = colegasDaBanca(s.id, participante.email, reservas);
  const link = situacao.tipo === 'pronta' ? linkTeamsDaBanca(s.id, dados.links) : '';
  const indice = indexarAvaliacoes(dados.avaliacoes);
  const avaliados =
    situacao.tipo === 'pronta'
      ? situacao.candidatos.filter((c) => indice.has(chaveAvaliacao(situacao.grupo, c.email))).length
      : 0;

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" data-banca={s.id}>
      <header className={`uf-${s.estado} px-4 py-3`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold tracking-wide uppercase opacity-85">
              {dia.data} ({dia.semana}) · {FAIXA_POR_ID[s.faixaId].label}
            </p>
            <h3 className="text-lg leading-tight font-extrabold">
              {s.rotulo} <span className="ml-1 rounded-md bg-white/20 px-1.5 py-0.5 align-middle text-xs font-bold">Banca {s.banca}</span>
            </h3>
          </div>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-white shadow ring-1 ring-white/30 hover:bg-emerald-600"
            >
              <span aria-hidden>▶</span> Entrar na Sala Teams
            </a>
          )}
        </div>
        <p className="mt-1.5 text-xs opacity-90">
          {colegas.length > 0
            ? `Dupla: ${colegas.map((c) => c.nome).join(', ')}`
            : 'Aguardando o 2º avaliador desta banca'}
          {reserva.pendente && ' · reserva aguardando envio'}
        </p>
      </header>

      <div className="space-y-3 p-3 sm:p-4">
        {situacao.tipo === 'livre' && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Banca livre: não há grupo de candidatos alocado.</p>
        )}
        {situacao.tipo === 'aguardando' && (
          <p className="flex gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
            <span aria-hidden>⏳</span>
            {AVISO_AGUARDANDO}
          </p>
        )}
        {situacao.tipo === 'pronta' && (
          <>
            <p className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>Candidatos do grupo {situacao.grupo}</span>
              <span className="tabular-nums">
                {avaliados}/{situacao.candidatos.length} avaliados
              </span>
            </p>
            <ul className="space-y-2">
              {situacao.candidatos.map((c) => (
                <CartaoCandidato
                  key={c.email}
                  candidato={c}
                  avaliacao={indice.get(chaveAvaliacao(situacao.grupo, c.email))}
                  meuEmail={participante.email}
                  aoSalvar={async (r) => {
                    const av = montarAvaliacao(
                      {
                        slotId: s.id,
                        grupo: situacao.grupo,
                        candidato: c,
                        avaliadorEmail: participante.email,
                        avaliadorNome: participante.nome,
                      },
                      r,
                    );
                    return (await aoSalvar(av)).editada;
                  }}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Aba "Minhas Bancas"
// ---------------------------------------------------------------------------
export function MinhasBancas({
  participante,
  identificacaoValida,
  reservas,
  dados,
  avaliacaoDisponivel,
  aoSalvar,
  aoIrParaGrade,
}: {
  participante: Participante;
  identificacaoValida: boolean;
  reservas: Reserva[];
  dados: DadosBancas;
  avaliacaoDisponivel: boolean;
  aoSalvar: (av: Avaliacao) => Promise<{ editada: boolean }>;
  aoIrParaGrade: () => void;
}) {
  if (!identificacaoValida) {
    return (
      <section className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-semibold text-slate-700">Informe seu nome e e-mail para ver suas bancas.</p>
        <p className="mt-1 text-xs text-slate-500">Use o mesmo e-mail com que você reservou os horários.</p>
        <button type="button" onClick={aoIrParaGrade} className="mt-4 rounded-lg bg-fgv-marinho px-4 py-2 text-sm font-bold text-white">
          Ir para a identificação
        </button>
      </section>
    );
  }

  const minhas = minhasBancas(participante.email, reservas);

  return (
    <section className="space-y-4" aria-label="Minhas Bancas">
      {!avaliacaoDisponivel && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          A planilha ainda usa a versão anterior do script e não envia os candidatos. Avise a coordenação para atualizar o
          Code.gs.
        </p>
      )}
      {minhas.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-slate-700">Você ainda não tem bancas confirmadas.</p>
          <p className="mt-1 text-xs text-slate-500">
            Reserve seus horários na Grade de Bancas. Depois de confirmados, eles aparecem aqui.
          </p>
          <button type="button" onClick={aoIrParaGrade} className="mt-4 rounded-lg bg-fgv-marinho px-4 py-2 text-sm font-bold text-white">
            Ir para a Grade de Bancas
          </button>
        </div>
      ) : (
        minhas.map((r) => (
          <CartaoMinhaBanca
            key={r.id}
            reserva={r}
            reservas={reservas}
            dados={dados}
            participante={participante}
            aoSalvar={aoSalvar}
          />
        ))
      )}
    </section>
  );
}
