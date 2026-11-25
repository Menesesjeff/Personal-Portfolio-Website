import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AVISO_AGUARDANDO, MinhasBancas } from '../src/components/MinhasBancas';
import { DADOS_VAZIOS, montarAvaliacao, NAO_APTO, PRESENTE, type Avaliacao, type DadosBancas } from '../src/lib/avaliacao';
import type { Reserva } from '../src/lib/types';

const eu = { nome: 'Ana Lima', email: 'ana@fgv.br' };
const reservas: Reserva[] = [
  { id: '1', timestamp: 't', slotId: 'SLOT-001', nome: 'Ana Lima', email: 'ana@fgv.br' },
  { id: '2', timestamp: 't', slotId: 'SLOT-001', nome: 'Bruno Reis', email: 'bruno@fgv.br' },
];
const comCandidatos = (extra: Partial<DadosBancas> = {}): DadosBancas => ({
  ...DADOS_VAZIOS,
  candidatos: { 'AL G1': [{ nome: 'Cand Um', email: 'c1@x.com' }, { nome: 'Cand Dois', email: 'c2@x.com' }] },
  links: { porSlot: {}, porGrupo: { 'AL G1': 'https://teams.microsoft.com/l/sala' } },
  ...extra,
});

function renderizar(dados: DadosBancas, aoSalvar = vi.fn(async () => ({ editada: false }))) {
  render(
    <MinhasBancas
      participante={eu}
      identificacaoValida
      reservas={reservas}
      dados={dados}
      avaliacaoDisponivel
      aoSalvar={aoSalvar}
      aoIrParaGrade={() => {}}
    />,
  );
  return aoSalvar;
}

describe('aba Minhas Bancas', () => {
  it('ANTES de popular Candidatos: mostra a reserva, a dupla e o aviso', () => {
    renderizar(DADOS_VAZIOS);
    expect(screen.getByText(/07\/12 \(segunda\) · 09h00-10h00/)).toBeTruthy();
    expect(screen.getByText('Dupla: Bruno Reis')).toBeTruthy();
    expect(screen.getByText(AVISO_AGUARDANDO)).toBeTruthy();
    expect(screen.queryByText('Entrar na Sala Teams')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Avaliar' })).toBeNull();
  });

  it('DEPOIS de popular Candidatos: botão do Teams, candidatos e status Pendente', () => {
    renderizar(comCandidatos());
    expect(screen.queryByText(AVISO_AGUARDANDO)).toBeNull();
    const teams = screen.getByRole('link', { name: /Entrar na Sala Teams/ });
    expect(teams.getAttribute('href')).toBe('https://teams.microsoft.com/l/sala');
    expect(screen.getByText('Cand Um')).toBeTruthy();
    expect(screen.getAllByText('Pendente')).toHaveLength(2);
    expect(screen.getByText('0/2 avaliados')).toBeTruthy();
  });

  it('preenche a rubrica com total em tempo real e salva', async () => {
    const aoSalvar = renderizar(comCandidatos());
    const cartao = document.querySelector('[data-candidato="c1@x.com"]') as HTMLElement;
    fireEvent.click(within(cartao).getByRole('button', { name: 'Avaliar' }));
    fireEvent.click(within(cartao).getByRole('button', { name: 'Sim, presente' }));
    fireEvent.click(within(cartao).getByRole('button', { name: 'Chave 4 — Superior' }));
    const notas = [3, 2, 3, 1, 2];
    ['Análise pedagógica e tomada de decisão', 'Argumentação e comunicação', 'Mediação e escuta', 'Coerência com princípios do CNCA', 'Postura profissional e colaboração'].forEach(
      (c, i) => fireEvent.click(within(cartao).getByRole('button', { name: `${c}: nota ${notas[i]}` })),
    );
    expect(within(cartao).getByText(/Total:/).textContent).toBe('Total: 11 / 15 pts');
    fireEvent.click(within(cartao).getByRole('button', { name: 'Sim, apto' }));
    await act(async () => {
      fireEvent.click(within(cartao).getByRole('button', { name: 'Salvar Avaliação' }));
    });
    expect(aoSalvar).toHaveBeenCalledTimes(1);
    const enviada = (aoSalvar.mock.calls[0] as unknown as [Avaliacao])[0];
    expect(enviada).toMatchObject({
      slotId: 'SLOT-001', grupo: 'AL G1', emailCandidato: 'c1@x.com', avaliadorEmail: 'ana@fgv.br',
      chaveVideo: 4, criterios: notas, totalPontos: 11, apto: 'Sim, apto',
    });
    expect(within(cartao).getByText('✓ Avaliação salva.')).toBeTruthy();
  });

  it('ausente desabilita as notas e libera o salvar direto', async () => {
    const aoSalvar = renderizar(comCandidatos());
    const cartao = document.querySelector('[data-candidato="c2@x.com"]') as HTMLElement;
    fireEvent.click(within(cartao).getByRole('button', { name: 'Avaliar' }));
    fireEvent.click(within(cartao).getByRole('button', { name: 'Não, ausente' }));
    expect((within(cartao).getByRole('button', { name: 'Mediação e escuta: nota 3' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.click(within(cartao).getByRole('button', { name: 'Salvar Avaliação' }));
    });
    expect((aoSalvar.mock.calls[0] as unknown as [Avaliacao])[0]).toMatchObject({ totalPontos: 0, apto: NAO_APTO });
  });

  it('ficha já preenchida pelo colega: "Avaliado por …" e modo Editar Avaliação', () => {
    const doBruno = montarAvaliacao(
      { slotId: 'SLOT-001', grupo: 'AL G1', candidato: { nome: 'Cand Um', email: 'c1@x.com' }, avaliadorEmail: 'bruno@fgv.br', avaliadorNome: 'Bruno Reis' },
      { presente: PRESENTE, chaveVideo: 2, criterios: [2, 2, 2, 2, 2], apto: 'Sim, apto', observacoes: '' },
    );
    renderizar(comCandidatos({ avaliacoes: [doBruno] }));
    const cartao = document.querySelector('[data-candidato="c1@x.com"]') as HTMLElement;
    expect(within(cartao).getByText('Avaliado por Bruno Reis')).toBeTruthy();
    expect(within(cartao).getByText('Avaliado • Apto (10/15)')).toBeTruthy();
    fireEvent.click(within(cartao).getByRole('button', { name: 'Editar Avaliação' }));
    expect(within(cartao).getByText(/será/).textContent).toContain('atualizada');
    expect(within(cartao).getByRole('button', { name: 'Chave 2 — Regular' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('1/2 avaliados')).toBeTruthy();
  });
});
