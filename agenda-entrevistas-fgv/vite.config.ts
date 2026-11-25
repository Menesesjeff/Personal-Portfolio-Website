/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base: './'` gera caminhos relativos: o mesmo build funciona na raiz de um
// domínio (Vercel/Netlify) ou em subpasta (GitHub Pages /<repo>/).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2019',
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    // Senha usada só nos testes automatizados (a senha real nunca fica no código).
    env: { VITE_ADMIN_PASSWORD: 'senha-de-teste-123' },
  },
});
