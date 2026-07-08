/* ============================================================
   OpenContact v6 — amorçage & routeur
   Quatre zones : Aujourd'hui · Mes pistes · Échanger · Moi.
   Ce fichier ne fait que démarrer (chargement, thème, service
   worker) et router ; chaque écran vit dans ui/, le moteur dans
   engine/ — il ne lit jamais l'écran. Auto-tests : ?test.
   ============================================================ */
import { APP_VERSION } from './engine/model.js';
import { THEME_KEY, kvSet } from './engine/storage.js';
import { S, bus, loadAll } from './ui/state.js';
import { $, $$, toast } from './ui/dom.js';
import { renderToday } from './ui/today.js';
import { renderPistes } from './ui/pistes.js';
import { renderEchanger } from './ui/echanger.js';
import { renderMoi } from './ui/moi.js';
import { openCapture } from './ui/capture.js';
import { downloadBackup } from './ui/moi.js';

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

  /* navigation */
  window.addEventListener('hashchange', applyRoute);
  $('#btnTheme').addEventListener('click', () => applyTheme(S.theme === 'dark' ? 'light' : 'dark', true));
  $('#bnAdd').addEventListener('click', () => openCapture());
  $('#btnAddTop').addEventListener('click', () => openCapture());
  $('#swExport').addEventListener('click', downloadBackup);

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
