/** Registra o Service Worker (somente em produção, para não atrapalhar o HMR). */
export function registrarServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js', { scope: './' })
      .then((reg) => {
        // Verifica atualização quando o app volta ao primeiro plano
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update();
        });
      })
      .catch((e) => console.warn('Falha ao registrar o Service Worker', e));
  });
}
