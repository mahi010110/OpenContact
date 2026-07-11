/* ============================================================
   OpenContact v6 — amorçage & routeur
   Quatre zones : Aujourd'hui · Mes pistes · Échanger · Moi.
   Ce fichier ne fait que démarrer (chargement, thème, service
   worker) et router ; chaque écran vit dans ui/, le moteur dans
   engine/ — il ne lit jamais l'écran. Auto-tests : ?test.
   ============================================================ */
import { APP_VERSION } from './engine/model.js';
import { THEME_KEY, kvSet } from './engine/storage.js';
import { S, bus, loadAll, reloadFromStorage } from './ui/state.js';
import { $, $$, toast } from './ui/dom.js';
import { renderToday } from './ui/today.js';
import { renderPistes } from './ui/pistes.js';
import { renderEchanger } from './ui/echanger.js';
import { renderMoi } from './ui/moi.js';
import { openCapture } from './ui/capture.js';
import { downloadBackup } from './ui/moi.js';
import { initSyncLive } from './ui/synclive.js';

const VIEWS = {
  aujourdhui: renderToday,
  pistes: renderPistes,
  echanger: renderEchanger,
  moi: renderMoi
};

function routeFromHash(){
  const r = (location.hash || '').replace(/^#\/?/, '');
  return VIEWS[r] ? r : 'aujourdhui';
}
function render(){
  /* un autre onglet a écrit pendant qu'une feuille était ouverte :
     on recharge maintenant que la voie est libre */
  if (S.stale && !document.querySelector('.overlay')){ reloadFromStorage(); return; }
  for (const k in VIEWS) $('#view-' + k).hidden = (k !== S.route);
  VIEWS[S.route]();
  $$('[data-r]').forEach(a => {
    const on = a.dataset.r === S.route;
    a.classList.toggle('on', on);
    if (a.closest('nav')) a.setAttribute('aria-current', on ? 'page' : 'false');
  });
}
function applyRoute(){
  S.route = routeFromHash();
  render();
  $('#view-' + S.route).scrollTop = 0;
}
bus.refresh = render;

function applyTheme(t, persist){
  S.theme = t;
  document.documentElement.dataset.theme = t;
  $('#metaTheme').content = (t === 'dark') ? '#1E232B' : '#F7F6F1';
  if (persist) kvSet(THEME_KEY, t);
}

(async function init(){
  console.info('OpenContact', APP_VERSION);
  await loadAll();
  applyTheme(S.theme, false);
  $('#sbVer').textContent = APP_VERSION;

  /* demander au navigateur de ne jamais purger le stockage (Safari
     efface sinon les données d'un site non visité depuis 7 jours) */
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  /* navigation */
  window.addEventListener('hashchange', applyRoute);
  $('#btnTheme').addEventListener('click', () => applyTheme(S.theme === 'dark' ? 'light' : 'dark', true));
  $('#bnAdd').addEventListener('click', () => openCapture());
  $('#btnAddTop').addEventListener('click', () => openCapture());
  $('#swExport').addEventListener('click', () => downloadBackup());   /* secours : brut, sans question */

  /* clavier : « / » saute à la recherche des pistes */
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (document.querySelector('.overlay')) return;
    e.preventDefault();
    if (S.route !== 'pistes') location.hash = '#/pistes';
    setTimeout(() => { try { $('#piQ').focus(); } catch (x) {} }, 60);
  });

  applyRoute();

  /* sync appareils : si une phrase de liaison existe, l'app rejoint la
     salle en arrière-plan et y RESTE — différé pour un démarrage net */
  setTimeout(() => { initSyncLive().catch(() => {}); }, 2000);

  /* partage entrant (PWA share_target) : « Partager » depuis LinkedIn ou
     le navigateur → capture pré-remplie ; les params sont consommés puis
     retirés de l'URL pour ne pas rejouer au rechargement */
  const sp = new URLSearchParams(location.search);
  if (sp.has('title') || sp.has('text') || sp.has('url')){
    const text = sp.get('text') || '';
    const website = sp.get('url') || (text.match(/https?:\/\/\S+/) || [''])[0];
    let name = (sp.get('title') || '')
      .replace(/\s*[|–—-]\s*(LinkedIn|Indeed|Glassdoor|Welcome to the Jungle|HelloWork).*$/i, '').trim();
    if (!name) name = text.replace(website, '').trim().split('\n')[0].slice(0, 80).trim();
    const desc = text.replace(website, '').trim().slice(0, 300);
    ['title', 'text', 'url'].forEach(k => sp.delete(k));
    history.replaceState(null, '', location.pathname + (sp.toString() ? '?' + sp : '') + location.hash);
    openCapture({ name, website, desc: desc !== name ? desc : '' });
  }

  /* PWA : hors-ligne après la première visite — enregistré en dernier,
     zéro impact sur le démarrage */
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller)
            toast('Nouvelle version prête — elle s’appliquera à la prochaine ouverture.');
        });
      });
    }).catch(() => {});
  }

  if (new URLSearchParams(location.search).has('test')){
    import('./tests.js').then(m => m.runSelfTests()).then(R => {
      const ko = R.filter(r => r.résultat !== '✓').length;
      toast(ko ? `Auto-tests : ${ko} échec(s) sur ${R.length} — détails en console`
               : `Auto-tests : ${R.length}/${R.length} OK ✓`);
    });
  }
})();
