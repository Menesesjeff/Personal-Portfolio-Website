import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  filtrarRanking,
  kpisResultados,
  montarRanking,
  PONTUACAO_MAXIMA,
  type Avaliacao,
  type FiltrosRanking,
  type LinhaRanking,
  type MapaCandidatos,
  type StatusCandidato,
} from '../lib/avaliacao';
import { baixarResultadosXlsx, formatarTimestamp } from '../services/exportacao';
import type { Sincronizador } from '../services/sincronizador';
import { BadgeAvaliacao } from './MinhasBancas';

const ROTULO_STATUS: Record<StatusCandidato, string> = {
  apto: 'Aptos',
  'nao-apto': 'Não-aptos',
  ausente: 'Ausentes',
  pendente: 'Pendentes',
};

function Indicador({ rotulo, valor, cor = 'text-fgv-marinho' }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200">
      <p className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">{rotulo}</p>
      <p className={`text-xl font-extrabold tabular-nums ${cor}`}>{valor}</p>
    </div>
  );
}

/** Sub-aba "Resultados & Ranking" da Área da Coordenação. */
export function ResultadosRanking({ sync, token }: { sync: Sincronizador; token: string }) {
  const [dados, setDados] = useState<{ candidatos: MapaCandidatos; avaliacoes: Avaliacao[] } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosRanking>({ uf: '', grupo: '', status: '' });
  const [baixando, setBaixando] = useState(false);
  const telaLarga = useMediaQuery('(min-width: 640px)');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await sync.carregarResultados(token));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, [sync, token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ranking = useMemo(() => (dados ? montarRanking(dados.candidatos, dados.avaliacoes) : []), [dados]);
  const lista = useMemo(() => filtrarRanking(ranking, filtros), [ranking, filtros]);
  const kpis = useMemo(() => kpisResultados(ranking), [ranking]);
  const ufs = useMemo(() => [...new Set(ranking.map((l) => l.uf))].sort(), [ranking]);
  const grupos = useMemo(
    () =>
      [...new Set(ranking.filter((l) => !filtros.uf || l.uf === filtros.uf).map((l) => l.grupo))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR', { numeric: true }),
      ),
    [ranking, filtros.uf],
  );

  const exportar = async () => {
    if (!dados) return;
    setBaixando(true);
    try {
      await baixarResultadosXlsx(ranking, dados.avaliacoes);
    } finally {
      setBaixando(false);
    }
  };

  const seletor = 'rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-fgv-azul';
  const nota = (l: LinhaRanking) => (l.avaliacao && l.status !== 'ausente' ? `${l.avaliacao.totalPontos}/${PONTUACAO_MAXIMA}` : '—');

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-xl bg-gradient-to-r from-fgv-marinho to-fgv-azul p-3 text-white sm:flex-row sm:items-center">
        <p className="flex-1 text-sm">
          <strong>Ranking Consolidado</strong>
          <span className="block text-xs text-sky-100">
            Ordem: aptos primeiro → maior pontuação → maior chave do vídeo. Pendentes no fim.
          </span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            className="rounded-lg bg-white/15 px-3 py-2.5 text-sm font-semibold ring-1 ring-white/40 hover:bg-white/25 disabled:opacity-50"
          >
            {carregando ? 'Atualizando…' : '↻ Atualizar'}
          </button>
          <button
            type="button"
            onClick={() => void exportar()}
            disabled={!dados || baixando}
            className="flex-1 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold shadow hover:bg-emerald-600 disabled:opacity-50"
          >
            {baixando ? 'Gerando…' : '⬇ Exportar Resultados (.xlsx)'}
          </button>
        </div>
      </div>

      {erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Não foi possível carregar os resultados: {erro}</p>}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Indicadores de resultados">
        <Indicador rotulo="Candidatos" valor={kpis.total} />
        <Indicador rotulo="Avaliados" valor={kpis.avaliados} cor="text-sky-700" />
        <Indicador rotulo="Pendentes" valor={kpis.pendentes} cor="text-slate-500" />
        <Indicador rotulo="Presentes" valor={kpis.presentes} cor="text-sky-700" />
        <Indicador rotulo="Ausentes" valor={kpis.ausentes} cor="text-amber-600" />
        <Indicador rotulo="Aptos" valor={kpis.aptos} cor="text-emerald-700" />
        <Indicador rotulo="Não-aptos" valor={kpis.naoAptos} cor="text-red-600" />
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-end gap-2">
          <h3 className="mr-auto text-sm font-bold text-fgv-marinho">
            Ranking ({lista.length}
            {lista.length !== ranking.length && ` de ${ranking.length}`})
          </h3>
          <select
            aria-label="Filtrar por UF"
            className={seletor}
            value={filtros.uf}
            onChange={(e) => setFiltros({ ...filtros, uf: e.target.value, grupo: '' })}
          >
            <option value="">Todas as UFs</option>
            {ufs.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por grupo"
            className={seletor}
            value={filtros.grupo}
            onChange={(e) => setFiltros({ ...filtros, grupo: e.target.value })}
          >
            <option value="">Todos os grupos</option>
            {grupos.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por status"
            className={seletor}
            value={filtros.status}
            onChange={(e) => setFiltros({ ...filtros, status: e.target.value as StatusCandidato | '' })}
          >
            <option value="">Todos os status</option>
            {(Object.keys(ROTULO_STATUS) as StatusCandidato[]).map((st) => (
              <option key={st} value={st}>
                {ROTULO_STATUS[st]}
              </option>
            ))}
          </select>
        </div>

        {!dados && carregando ? (
          <p className="rounded-xl bg-white px-3 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="rounded-xl bg-white px-3 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
            {ranking.length === 0
              ? 'Nenhum candidato ainda. O ranking aparece assim que a aba "Candidatos" da planilha for preenchida.'
              : 'Nenhum candidato corresponde aos filtros.'}
          </p>
        ) : telaLarga ? (
          <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-fgv-marinho text-xs text-white">
                <tr>
                  {['#', 'Grupo', 'Candidato', 'Status', 'Pontos', 'Vídeo', 'Avaliador', 'Avaliado em'].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {lista.map((l) => (
                  <tr key={`${l.grupo}|${l.emailCandidato}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-500 tabular-nums">{l.posicao}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`uf-${l.uf} rounded px-1.5 py-0.5 text-xs font-semibold`}>{l.grupo}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="block font-medium text-slate-800">{l.candidato}</span>
                      <span className="block text-xs text-slate-500">{l.emailCandidato}</span>
                    </td>
                    <td className="px-3 py-2">
                      <BadgeAvaliacao avaliacao={l.avaliacao} />
                    </td>
                    <td className="px-3 py-2 font-bold tabular-nums">{nota(l)}</td>
                    <td className="px-3 py-2 tabular-nums">{l.avaliacao?.chaveVideo ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{l.avaliacao?.avaliadorNome ?? '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-500">
                      {l.avaliacao ? formatarTimestamp(l.avaliacao.timestamp) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ol className="space-y-2">
            {lista.map((l) => (
              <li key={`${l.grupo}|${l.emailCandidato}`} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <div className="flex items-start gap-2">
                  <span className="text-sm font-extrabold text-slate-400 tabular-nums">{l.posicao}º</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{l.candidato}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                      <span className={`uf-${l.uf} rounded px-1.5 py-0.5 font-semibold`}>{l.grupo}</span>
                      <BadgeAvaliacao avaliacao={l.avaliacao} />
                      {l.avaliacao?.chaveVideo && <span>Vídeo {l.avaliacao.chaveVideo}</span>}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
