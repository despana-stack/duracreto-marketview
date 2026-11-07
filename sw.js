// Duracreto MarketView — service worker. Permite instalar la app y abrirla rápido. Nunca guarda datos del servidor.
// Al publicar cambios en archivos de la app, sube VERSION en core.js y aquí (deben coincidir).
const VERSION = '1.2.0';
const CACHE = 'marketview-' + VERSION;
const APP = ['./', 'index.html', 'core.css', 'core.js', 'config.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/logo-claro.png', 'icons/logo-oscuro.png'];
// Librerías y tipografías externas: se guardan la primera vez (no cambian). Los mapas base y la API nunca se guardan.
const LIBRERIAS = /(^|\.)(cdnjs\.cloudflare\.com|unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('marketview-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin === location.origin) {
    // Archivos de la app y de los módulos: primero la red (para recibir cambios); sin internet, la copia guardada.
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined))));
  } else if (LIBRERIAS.test(u.hostname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
      return res;
    })));
  }
  // Todo lo demás (Apps Script, mapas base, Drive): directo a internet, sin guardar.
});
