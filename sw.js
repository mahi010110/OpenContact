/* OpenContact — service worker (hors-ligne + installation)
   Stratégie « stale-while-revalidate » : on sert le cache immédiatement
   (démarrage instantané, même sans réseau), puis on rafraîchit en
   arrière-plan — la version suivante s'applique à l'ouverture d'après.
   Jamais mis en cache : le géocodage (données fraîches) et les tuiles de
   carte (volume) — la carte demande donc du réseau, tout le reste non. */
const CACHE = 'oc-v1';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname.includes('nominatim') ||
      url.hostname.includes('cartocdn') ||
      url.hostname.includes('tile.openstreetmap')) return;   /* réseau direct */
  /* toute navigation ressert l'app (page unique) */
  const req = (e.request.mode === 'navigate') ? new Request('./index.html') : e.request;
  e.respondWith(
    caches.open(CACHE).then(async c => {
      const cached = await c.match(req);
      const fresh = fetch(req).then(r => {
        /* r.ok couvre le même domaine ; « opaque » couvre les libs CDN chargées sans CORS */
        if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
        return r;
      }).catch(() => null);
      return cached || fresh.then(r => r || cached);
    })
  );
});
