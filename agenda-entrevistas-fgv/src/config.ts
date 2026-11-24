export const CONFIG = {
  appsScriptUrl: (import.meta.env.VITE_APPS_SCRIPT_URL ?? '').trim(),
  senhaCoordenacao: (import.meta.env.VITE_COORD_PASS ?? '').trim() || 'admin2026',
  intervaloSyncMs: 30000,
};
