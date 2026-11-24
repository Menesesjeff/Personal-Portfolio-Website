import { describe, expect, it } from 'vitest';
import { slotEm } from '../src/data/grade';
import {
  aplicarReservas,
  alternarSelecao,
  chaveFaixa,
  emailValido,
  estadoDoSlot,
  nomeValido,
  ocupacao,
  reservasDoParticipante,
  sanearSelecao,
  slotLotado,
  validarEnvio,
  validarIdentificacao,
} from '../src/lib/regras';
import type { Reserva } from '../src/lib/types';

let seq = 0;
function reserva(slotId: string, email: string, nome = 'Fulano de Tal'): Reserva {
  seq += 1;
  return { id: `R-${seq}`, timestamp: new Date(2026, 10, 1, 9, 0, seq).toISOString(), slotId, nome, email };
}

const A = slotEm('D1', 'H1', 'A').id; // SLOT-001
const B = slotEm('D1', 'H1', 'B').id; // SLOT-002
const C = slotEm('D1', 'H1', 'C').id;
const D = slotEm('D1', 'H1', 'D').id;
const OUTRA_FAIXA = slotEm('D1', 'H2', 'A').id;
const OUTRO_DIA = slotEm('D2', 'H1', 'B').id;
const EU = 'eu@fgv.br';

describe('validação de identificação (regra 4)', () => {
  it.each([
    ['ana@fgv.br', true],
    ['  Ana.Silva+x@sub.dominio.com.br ', true],
    ['ana@fgv', false],
    ['ana fgv.br', false],
    ['@fgv.br', false],
    ['', false],
  ])('e-mail %s → %s', (email, esperado) => {
    expect(emailValido(email)).toBe(esperado);
  });

  it('exige nome e sobrenome', () => {
    expect(nomeValido('Maria Souza')).toBe(true);
    expect(nomeValido('  Maria   da  Silva ')).toBe(true);
    expect(nomeValido('Maria')).toBe(false);
    expect(nomeValido('')).toBe(false);
  });

  it('retorna mensagens de erro específicas', () => {
    expect(validarIdentificacao({ nome: '', email: '' })).toEqual({
      nome: 'Informe seu nome completo.',
      email: 'Informe seu e-mail.',
    });
    expect(validarIdentificacao({ nome: 'Ana', email: 'x@y' })).toEqual({
      nome: 'Informe nome e sobrenome.',
      email: 'E-mail em formato inválido.',
    });
    expect(validarIdentificacao({ nome: 'Ana Lima', email: 'ana@fgv.br' })).toEqual({});
  });
});

describe('regra 1 — múltiplos horários', () => {
  it('permite selecionar várias faixas e dias diferentes', () => {
    let sel: string[] = [];
    for (const id of [A, OUTRA_FAIXA, OUTRO_DIA, slotEm('D5', 'H5', 'D').id]) sel = alternarSelecao(id, sel, [], EU);
    expect(sel).toHaveLength(4);
  });

  it('desmarcar remove da seleção', () => {
    const sel = alternarSelecao(A, [A, OUTRA_FAIXA], [], EU);
    expect(sel).toEqual([OUTRA_FAIXA]);
  });
});

describe('regra 2 — 1 banca por faixa horária no mesmo dia', () => {
  it('ao selecionar uma banca, as outras 3 da mesma faixa/dia ficam bloqueadas', () => {
    const sel = [A];
    expect(estadoDoSlot(A, sel, [], EU)).toEqual({ tipo: 'selecionado' });
    for (const id of [B, C, D]) {
      expect(estadoDoSlot(id, sel, [], EU)).toEqual({ tipo: 'bloqueado', motivo: 'faixa-ocupada' });
    }
    expect(estadoDoSlot(OUTRA_FAIXA, sel, [], EU).tipo).toBe('disponivel');
    expect(estadoDoSlot(OUTRO_DIA, sel, [], EU).tipo).toBe('disponivel');
  });

  it('não adiciona segunda banca na mesma faixa', () => {
    expect(alternarSelecao(B, [A], [], EU)).toEqual([A]);
  });

  it('libera as demais ao desmarcar a atual', () => {
    const sel = alternarSelecao(A, [A], [], EU);
    expect(alternarSelecao(B, sel, [], EU)).toEqual([B]);
  });

  it('considera reservas já confirmadas do mesmo e-mail (case-insensitive)', () => {
    const reservas = [reserva(A, 'EU@FGV.BR')];
    expect(estadoDoSlot(A, [], reservas, EU)).toEqual({ tipo: 'reservado' });
    expect(estadoDoSlot(B, [], reservas, EU)).toEqual({ tipo: 'bloqueado', motivo: 'faixa-ocupada' });
    // outra pessoa não é afetada
    expect(estadoDoSlot(B, [], reservas, 'outro@fgv.br').tipo).toBe('disponivel');
  });

  it('chaveFaixa agrupa por dia+faixa', () => {
    expect(chaveFaixa(A)).toBe(chaveFaixa(D));
    expect(chaveFaixa(A)).not.toBe(chaveFaixa(OUTRO_DIA));
    expect(chaveFaixa('SLOT-999')).toBeNull();
  });
});

describe('regra 3 — capacidade de 2 por banca', () => {
  it('conta ocupação e detecta lotação', () => {
    const r = [reserva(A, 'a@x.com')];
    expect(ocupacao(A, r)).toBe(1);
    expect(slotLotado(A, r)).toBe(false);
    r.push(reserva(A, 'b@x.com'));
    expect(slotLotado(A, r)).toBe(true);
  });

  it('banca com 2 reservas fica bloqueada para novos usuários', () => {
    const r = [reserva(A, 'a@x.com'), reserva(A, 'b@x.com')];
    expect(estadoDoSlot(A, [], r, EU)).toEqual({ tipo: 'bloqueado', motivo: 'lotada' });
    expect(alternarSelecao(A, [], r, EU)).toEqual([]);
  });

  it('quem já está na banca lotada a vê como "reservado"', () => {
    const r = [reserva(A, 'a@x.com'), reserva(A, EU)];
    expect(estadoDoSlot(A, [], r, EU)).toEqual({ tipo: 'reservado' });
  });

  it('sistema inteiro comporta exatamente 200 reservas', () => {
    let reservas: Reserva[] = [];
    const todos = Array.from({ length: 100 }, (_, i) => `SLOT-${String(i + 1).padStart(3, '0')}`);
    // Cada pessoa só pega 1 banca por faixa: 8 pessoas × 25 faixas cobrem tudo.
    for (let p = 0; p < 8; p++) {
      const ids = todos.filter((_, i) => i % 4 === p % 4);
      reservas = aplicarReservas(reservas, { nome: `Pessoa ${p} Teste`, email: `p${p}@x.com` }, ids).reservas;
    }
    expect(reservas).toHaveLength(200);
    const extra = aplicarReservas(reservas, { nome: 'Nova Pessoa', email: 'nova@x.com' }, todos);
    expect(extra.aceitas).toHaveLength(0);
    expect(extra.rejeitadas.every((r) => r.motivo === 'lotada')).toBe(true);
  });
});

describe('aplicarReservas / regra 4 — revalidação antes de persistir', () => {
  it('normaliza nome e e-mail e gera timestamp/id', () => {
    const r = aplicarReservas([], { nome: '  Ana   Lima ', email: ' ANA@FGV.BR ' }, [A], () => 'T', () => 'ID1');
    expect(r.aceitas).toEqual([{ id: 'ID1', timestamp: 'T', slotId: A, nome: 'Ana Lima', email: 'ana@fgv.br' }]);
  });

  it('rejeita banca que lotou entre a seleção e o envio', () => {
    const atuais = [reserva(B, 'a@x.com'), reserva(B, 'b@x.com')];
    const r = aplicarReservas(atuais, { nome: 'Eu Mesmo', email: EU }, [B, OUTRA_FAIXA]);
    expect(r.aceitas.map((a) => a.slotId)).toEqual([OUTRA_FAIXA]);
    expect(r.rejeitadas).toEqual([{ slotId: B, motivo: 'lotada' }]);
    expect(r.reservas).toHaveLength(3);
  });

  it('rejeita duplicidade e conflito de faixa dentro do mesmo envio', () => {
    const r = aplicarReservas([reserva(OUTRO_DIA, EU)], { nome: 'Eu Mesmo', email: EU }, [A, B, A, OUTRO_DIA, 'SLOT-777']);
    expect(r.aceitas.map((a) => a.slotId)).toEqual([A]);
    expect(r.rejeitadas).toEqual([
      { slotId: B, motivo: 'faixa-ocupada' },
      { slotId: OUTRO_DIA, motivo: 'ja-reservado' },
      { slotId: 'SLOT-777', motivo: 'inexistente' },
    ]);
  });

  it('validarEnvio bloqueia sem nome/e-mail válidos ou sem seleção', () => {
    const v = validarEnvio({ nome: '', email: 'x' }, [], []);
    expect(v.ok).toBe(false);
    expect(v.erros).toMatchObject({ nome: expect.any(String), email: expect.any(String), selecao: expect.any(String) });
  });

  it('validarEnvio aprova envio válido e aponta indisponíveis', () => {
    expect(validarEnvio({ nome: 'Ana Lima', email: 'ana@fgv.br' }, [A], []).ok).toBe(true);
    const lotado = [reserva(A, 'a@x.com'), reserva(A, 'b@x.com')];
    const v = validarEnvio({ nome: 'Ana Lima', email: 'ana@fgv.br' }, [A], lotado);
    expect(v.ok).toBe(false);
    expect(v.rejeitadas).toEqual([{ slotId: A, motivo: 'lotada' }]);
  });
});

describe('sanearSelecao', () => {
  it('remove slots que lotaram ou passaram a conflitar após sincronizar', () => {
    const reservas = [reserva(A, 'a@x.com'), reserva(A, 'b@x.com'), reserva(OUTRO_DIA, EU)];
    const sel = sanearSelecao([A, OUTRA_FAIXA, slotEm('D2', 'H1', 'C').id], reservas, EU);
    expect(sel).toEqual([OUTRA_FAIXA]);
  });

  it('reservasDoParticipante ignora e-mail vazio', () => {
    expect(reservasDoParticipante('', [reserva(A, '')])).toEqual([]);
  });
});
