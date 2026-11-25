import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { criarVerificadorSenha, HASH_SENHA_PADRAO, sha256 } from '../src/lib/senha';

describe('senha da coordenação', () => {
  it('SHA-256 confere com a implementação de referência', () => {
    for (const t of ['', 'abc', 'Agenda das Bancas — ção ✓', 'x'.repeat(200)]) {
      expect(sha256(t)).toBe(createHash('sha256').update(t, 'utf8').digest('hex'));
    }
  });

  it('sem VITE_ADMIN_PASSWORD, vale a senha padrão (só o hash fica no código)', () => {
    const verificar = criarVerificadorSenha('', sha256('Senha-Forte-Teste!'));
    expect(verificar('Senha-Forte-Teste!')).toBe(true);
    expect(verificar('admin2026')).toBe(false);
    expect(HASH_SENHA_PADRAO).not.toBe(sha256('admin2026'));
    expect(HASH_SENHA_PADRAO).toMatch(/^[0-9a-f]{64}$/);
  });

  it('com VITE_ADMIN_PASSWORD, ela tem prioridade', () => {
    const verificar = criarVerificadorSenha('minha-senha');
    expect(verificar('minha-senha')).toBe(true);
    expect(verificar('Senha-Forte-Teste!')).toBe(false);
  });
});
