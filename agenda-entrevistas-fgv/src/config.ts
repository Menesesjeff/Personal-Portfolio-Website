import { criarVerificadorSenha } from './lib/senha';

/** Web App do Google Apps Script (planilha da coordenação) usado por padrão. */
export const APPS_SCRIPT_URL_PADRAO =
  'https://script.google.com/macros/s/AKfycbw0S1OwEj5Ia2oXeQ3-poW9_kDFpFEBtosVPvwNLMBkEIdtEf_1jImfkHhY63NRvG6ThA/exec';

const urlAmbiente = (import.meta.env.VITE_APPS_SCRIPT_URL ?? '').trim();

// VITE_ADMIN_PASSWORD (preferencial) ou VITE_COORD_PASS (legado); vazio = senha padrão (só o hash fica no código).
const senhaAmbiente = (import.meta.env.VITE_ADMIN_PASSWORD ?? import.meta.env.VITE_COORD_PASS ?? '').trim();

export const CONFIG = {
  // VITE_APPS_SCRIPT_URL tem prioridade; nos testes automatizados o app roda em modo local.
  appsScriptUrl: urlAmbiente || (import.meta.env.MODE === 'test' ? '' : APPS_SCRIPT_URL_PADRAO),
  verificarSenha: criarVerificadorSenha(senhaAmbiente),
  intervaloSyncMs: 30000,
};
