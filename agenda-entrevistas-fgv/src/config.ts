/** Web App do Google Apps Script (planilha da coordenação) usado por padrão. */
export const APPS_SCRIPT_URL_PADRAO =
  'https://script.google.com/macros/s/AKfycbw0S1OwEj5Ia2oXeQ3-poW9_kDFpFEBtosVPvwNLMBkEIdtEf_1jImfkHhY63NRvG6ThA/exec';

const urlAmbiente = (import.meta.env.VITE_APPS_SCRIPT_URL ?? '').trim();

export const CONFIG = {
  // VITE_APPS_SCRIPT_URL tem prioridade; nos testes automatizados o app roda em modo local.
  appsScriptUrl: urlAmbiente || (import.meta.env.MODE === 'test' ? '' : APPS_SCRIPT_URL_PADRAO),
  senhaCoordenacao: (import.meta.env.VITE_COORD_PASS ?? '').trim() || 'admin2026',
  intervaloSyncMs: 30000,
};
