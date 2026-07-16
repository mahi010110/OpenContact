/* OpenContact — service worker (hors-ligne + installation)
   Stratégie « stale-while-revalidate » : on sert le cache immédiatement
   (démarrage instantané, même sans réseau), puis on rafraîchit en
   arrière-plan — la version suivante s'applique à l'ouverture d'après.
   Jamais mis en cache : le géocodage (données fraîches) et les tuiles de
   carte (volume) — la carte demande donc du réseau, tout le reste non. */
const CACHE = 'oc-v19';
const PRECACHE = ['./', './index.html', './app.js', './tests.js',
  './engine/crypto.js', './engine/exchange.js', './engine/filter.js',
  './engine/geo.js', './engine/merge.js', './engine/model.js',
  './engine/score.js', './engine/storage.js', './engine/sync.js', './engine/utils.js',
  './engine/vault.js', './engine/ring.js', './engine/campaign.js', './engine/mailer.js',
  './ui/dom.js', './ui/dates.js', './ui/state.js', './ui/actions.js', './ui/sort.js', './ui/verrou.js',
  './ui/mail.js', './ui/capture.js', './ui/fiche.js', './ui/today.js',
  './ui/pistes.js', './ui/moi.js', './ui/echanger.js', './ui/direct.js', './ui/synclive.js',
  './ui/contact.js', './ui/edit.js', './ui/prospect.js',
  './ui/qr.js', './ui/donner.js', './ui/recevoir.js', './ui/profil.js', './ui/connexions.js', './oauth.html',
  './assets/vendor/qrcode-generator.mjs', './assets/vendor/jsQR.js',
  './assets/vendor/trystero-nostr.min.js',
  './manifest.webmanifest', './icon.svg',
  './styles/app.css',
  './styles/tokens/fonts.css',
  './styles/tokens/colors.css',
  './styles/tokens/typography.css',
  './styles/tokens/spacing.css',
  './styles/tokens/effects.css',
  './styles/tokens/base.css',
  './assets/fonts/IBMPlexMono-Medium.woff2',
  './assets/fonts/IBMPlexMono-Regular.woff2',
  './assets/fonts/IBMPlexMono-SemiBold.woff2',
  './assets/fonts/PublicSans-Italic[wght].woff2',
  './assets/fonts/PublicSans[wght].woff2',
  './assets/fonts/Silkscreen-Bold.woff2',
  './assets/fonts/Silkscreen-Regular.woff2',
  './assets/icons/archive.svg',
  './assets/icons/arrow-down.svg',
  './assets/icons/arrow-left.svg',
  './assets/icons/arrow-right.svg',
  './assets/icons/arrow-up.svg',
  './assets/icons/attachment.svg',
  './assets/icons/book-open.svg',
  './assets/icons/briefcase.svg',
  './assets/icons/building.svg',
  './assets/icons/bulletlist.svg',
  './assets/icons/calendar.svg',
  './assets/icons/check.svg',
  './assets/icons/checkbox-on.svg',
  './assets/icons/checkbox.svg',
  './assets/icons/chevron-down.svg',
  './assets/icons/chevron-left.svg',
  './assets/icons/chevron-right.svg',
  './assets/icons/chevron-up.svg',
  './assets/icons/clipboard.svg',
  './assets/icons/clock.svg',
  './assets/icons/close.svg',
  './assets/icons/contact.svg',
  './assets/icons/copy.svg',
  './assets/icons/directions.svg',
  './assets/icons/download.svg',
  './assets/icons/external-link.svg',
  './assets/icons/eye-off.svg',
  './assets/icons/eye.svg',
  './assets/icons/file.svg',
  './assets/icons/flag.svg',
  './assets/icons/folder.svg',
  './assets/icons/gps.svg',
  './assets/icons/grid-2x2-2.svg',
  './assets/icons/grid-3x3.svg',
  './assets/icons/home.svg',
  './assets/icons/inbox.svg',
  './assets/icons/info-box.svg',
  './assets/icons/invert.svg',
  './assets/icons/lightbulb.svg',
  './assets/icons/link.svg',
  './assets/icons/list-box.svg',
  './assets/icons/lock.svg',
  './assets/icons/logout.svg',
  './assets/icons/mail.svg',
  './assets/icons/map-pin-home.svg',
  './assets/icons/map-pin.svg',
  './assets/icons/menu.svg',
  './assets/icons/message-text.svg',
  './assets/icons/minus.svg',
  './assets/icons/moon.svg',
  './assets/icons/more-horizontal.svg',
  './assets/icons/more-vertical.svg',
  './assets/icons/note.svg',
  './assets/icons/pencil.svg',
  './assets/icons/phone.svg',
  './assets/icons/plus.svg',
  './assets/icons/radio.svg',
  './assets/icons/redo.svg',
  './assets/icons/reload.svg',
  './assets/icons/save.svg',
  './assets/icons/search.svg',
  './assets/icons/settings-2.svg',
  './assets/icons/share.svg',
  './assets/icons/shield.svg',
  './assets/icons/sort-vertical.svg',
  './assets/icons/sparkles.svg',
  './assets/icons/square-alert.svg',
  './assets/icons/switch.svg',
  './assets/icons/trash.svg',
  './assets/icons/undo.svg',
  './assets/icons/upload.svg',
  './assets/icons/user.svg',
  './assets/icons/zap.svg',
  './assets/logo/piste-a-reseau.svg'];

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
