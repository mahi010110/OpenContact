/* E2E parcours d'un profil NEUF (première ouverture) : ce qu'aucun autre
   scénario ne joue en entier — l'app vide qui enseigne, la toute première
   capture faite à la main, et sa survie au rechargement. Mobile ET bureau.
   (Le hors-ligne réel est couvert par e2e-oauth-sw ; le thème sombre par
   e2e-pistes — ici on ne les redouble pas.) */
import { chromium, chromiumPath, SHOTS, serveRepo, attendre } from './outils.mjs';

const { server, base } = await serveRepo();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };
const errors = [];
const watch = p => {
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push(String(e)));
};
const closeSheets = p => p.evaluate(async () => {
  const { topSheet } = await import('./ui/dom.js');
  let s; let n = 0;
  while ((s = topSheet()) && n++ < 5){ s.close(null, true); await new Promise(r => setTimeout(r, 120)); }
});

/* ---------- mobile : première ouverture, tout est vide ---------- */
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const M = await mob.newPage();
watch(M);
await M.goto(base, { waitUntil: 'load' });
await M.waitForSelector('#view-aujourdhui:not([hidden])');

/* Aujourd'hui vide DOIT enseigner, jamais un « aucune donnée » sec (CLAUDE §6) */
const tdEmpty = await M.textContent('.td-empty').catch(() => '');
if (!/première piste|quoi faire|un jour à la fois/i.test(tdEmpty))
  fail('Aujourd’hui vide n’enseigne pas : ' + JSON.stringify(tdEmpty));
else console.log('Aujourd’hui vide : état enseignant ✓');
await M.screenshot({ path: SHOTS + '/parcours-neuf-aujourdhui.png' });

/* Mes pistes vide : même exigence */
await M.click('.bottomnav a[data-r="pistes"]');
await M.waitForSelector('#view-pistes:not([hidden])');
const piEmpty = await M.textContent('.td-empty, .empty-list').catch(() => '');
if (!/Aucune piste|Ajoute une piste|première piste/i.test(piEmpty))
  fail('Mes pistes vide n’enseigne pas : ' + JSON.stringify(piEmpty));
else console.log('Mes pistes vide : état enseignant ✓');

/* première capture — à la main, comme un vrai premier geste */
await M.click('#bnAdd');
await M.waitForSelector('#cpName');
await M.fill('#cpName', 'Boulangerie Cyber SARL');
await M.fill('#cpCity', 'Lille');
await M.click('.overlay .btn-primary');           /* Enregistrer la piste */
await attendre(M, async () => (await import('./ui/state.js')).S.companies.length === 1,
  { timeout: 8000, message: 'première capture' });
/* la capture enchaîne « prochaine action ? » : on referme */
await closeSheets(M);
await M.waitForSelector('.overlay', { state: 'detached', timeout: 5000 }).catch(() => {});
console.log('Première capture : une piste créée depuis un profil neuf ✓');

/* elle s'affiche dans la liste */
await M.click('.bottomnav a[data-r="pistes"]');
await M.waitForSelector('#view-pistes:not([hidden])');
const listed = await M.evaluate(() =>
  [...document.querySelectorAll('#piBody h3, #piBody b')].some(n => /Boulangerie Cyber/.test(n.textContent)));
if (!listed) fail('la piste capturée n’apparaît pas dans Mes pistes');
else console.log('La piste capturée s’affiche dans Mes pistes ✓');

/* persistance : elle survit à un rechargement (IndexedDB, pas la mémoire) */
await M.reload({ waitUntil: 'load' });
await attendre(M, async () => (await import('./ui/state.js')).S.companies.some(c => /Boulangerie Cyber/.test(c.name)),
  { timeout: 8000, message: 'persistance après rechargement' });
console.log('La piste survit au rechargement ✓');

/* ---------- bureau neuf : l'exemple enseigne aussi ---------- */
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const D = await desk.newPage();
watch(D);
await D.goto(base, { waitUntil: 'load' });
await D.waitForSelector('#view-aujourdhui:not([hidden])');
/* « Voir un exemple » pose de vraies pistes de démo, supprimables */
await D.evaluate(async () => {
  const { addDemo } = await import('./ui/state.js');
  addDemo();
  (await import('./ui/state.js')).bus.refresh?.();
});
await attendre(D, async () => (await import('./ui/state.js')).S.companies.some(c => c.demo),
  { timeout: 6000, message: 'pistes d’exemple' });
console.log('Bureau neuf : les pistes d’exemple se posent ✓');
await D.screenshot({ path: SHOTS + '/parcours-neuf-bureau-demo.png' });

if (errors.length) fail('erreurs console : ' + JSON.stringify(errors.slice(0, 6)));
else console.log('Zéro erreur console.');
console.log(process.exitCode ? 'E2E parcours neuf : ÉCHEC' : 'E2E parcours neuf : OK');
await browser.close();
server.close();
process.exit(process.exitCode || 0);
