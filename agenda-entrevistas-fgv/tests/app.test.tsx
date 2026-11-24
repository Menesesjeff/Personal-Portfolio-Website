import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Recarrega os módulos a cada teste para zerar o Sincronizador (singleton).
let App: ComponentType;
beforeEach(async () => {
  vi.resetModules();
  App = (await import('../src/App')).default;
});

const slot = (id: string) => document.querySelector(`[data-slot="${id}"]`) as HTMLButtonElement;

describe('fluxo do participante (UI, modo local)', () => {
  it('seleciona, bloqueia a faixa, valida identificação e confirma', async () => {
    render(<App />);

    // jsdom sem matchMedia → layout mobile com abas por dia
    expect(screen.getAllByRole('tab')).toHaveLength(5);

    fireEvent.click(slot('SLOT-001'));
    expect(slot('SLOT-001').getAttribute('aria-pressed')).toBe('true');
    for (const id of ['SLOT-002', 'SLOT-003', 'SLOT-004']) expect(slot(id).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Confirmar Seleção (1)' })).toBeTruthy();

    // ponto indicador na aba do dia
    expect(screen.getAllByLabelText('há seleção neste dia')).toHaveLength(1);

    // sem identificação: não abre a confirmação e mostra erros
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Seleção (1)' }));
    expect(screen.getByText('Informe seu nome completo.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Ex.: Maria da Silva Souza'), { target: { value: 'Ana Lima' } });
    fireEvent.change(screen.getByPlaceholderText('nome@exemplo.com'), { target: { value: 'ana@fgv.br' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Seleção (1)' }));

    const dialogo = screen.getByRole('dialog', { name: 'Confirmar seleção' });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar e enviar' }));
    });

    expect(screen.getByText(/1 horário\(s\) confirmado\(s\)/)).toBeTruthy();
    expect(slot('SLOT-001').disabled).toBe(true); // agora "confirmado"
    expect(slot('SLOT-002').disabled).toBe(true); // mesma faixa continua bloqueada
    expect(screen.getByRole('button', { name: 'Confirmar Seleção (0)' })).toBeTruthy();
  });

  it('chips da barra inferior podem ser removidos e "Limpar" zera a seleção', () => {
    render(<App />);
    fireEvent.click(slot('SLOT-001'));
    fireEvent.click(slot('SLOT-005'));
    expect(screen.getByRole('button', { name: 'Confirmar Seleção (2)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remover 07/12 · 09h00-10h00 · Banca A' }));
    expect(screen.getByRole('button', { name: 'Confirmar Seleção (1)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(screen.getByRole('button', { name: 'Confirmar Seleção (0)' })).toBeTruthy();
  });

  it('Área da Coordenação exige senha e mostra KPIs', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '🔒 Área da Coordenação' }));
    const input = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByText('Senha incorreta.')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'admin2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByText('Total de Bancas')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Baixar Planilha Excel/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeTruthy();
  });
});
