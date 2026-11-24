/* Service Worker — Agenda das Bancas FGV DGPE
 * - App shell pré-cacheado (abre offline e é instalável)
 * - Navegação: network-first com fallback ao index.html em cache
 * - Assets do mesmo domínio: stale-while-revalidate
 * - Requisições ao Google Apps Script NÃO são interceptadas (sempre rede)
 */
const VERSAO = 'agenda-fgv-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/logo-header.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSAO).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Apps Script, fontes etc.

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put('./index.html', copia));
          return resp;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.open(VERSAO).then((cache) =>
      cache.match(req).then((emCache) => {
        const rede = fetch(req)
          .then((resp) => {
            if (resp && resp.status === 200) cache.put(req, resp.clone());
            return resp;
          })
          .catch(() => emCache);
        return emCache || rede;
      }),
    ),
  );
});
