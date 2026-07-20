/* E2E « Mes pistes » — filtres exposés et statut au glisser (plan v7 §2) :
   la feuille Filtrer (statut + domaine, grammaire du tri : tap = applique,
   re-tap du bouton actif = tout montrer), et le tableau desktop où déposer
   une carte dans une autre colonne change le statut avec une trace propre. */
import { chromium, chromiumPath, SHOTS, serveRepo } from './outils.mjs';

const { server, base } = await serveRepo();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const errors = [];
const watchErrors = target => {
  target.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  target.on('pageerror', e => errors.push(String(e)));
};
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };

const seed = async page => {
  await page.goto(base, { waitUntil: 'load' });
  await page.evaluate(async () => {
    const st = await import('./engine/storage.js');
    await st.kvInit();
    await st.kvSet(st.DATA_KEY, JSON.stringify([
      { id: 'pi-a', name: 'Cyberdef', domain: 'cyber', status: 'todo', updatedAt: 4 },
      { id: 'pi-b', name: 'WebAgence', domain: 'esn', status: 'active', updatedAt: 3 },
      { id: 'pi-c', name: 'CloudNine', domain: 'cloud', status: 'reply', updatedAt: 2 },
      { id: 'pi-d', name: 'CyberVille', domain: 'cyber', status: 'active', updatedAt: 1 }
    ]));
  });
  await page.goto(base + '/#/pistes');
  await page.reload({ waitUntil: 'load' });      /* l'état ne se relit qu'au démarrage */
  await page.waitForFunction(async () => (await import('./ui/state.js')).S.companies.length === 4);
  await page.waitForSelector('#piFilt');
};
const names = page => page.evaluate(() =>
  [...document.querySelectorAll('#piBody .row-item h3, #piBody .bcard b')].map(n => n.textContent).sort());

/* ---------- téléphone : filtrer, combiner, tout remontrer ---------- */
const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const mPage = await mCtx.newPage();
watchErrors(mPage);
await seed(mPage);

await mPage.click('#piFilt');
await mPage.waitForSelector('.fl-chip');
const chipH = await mPage.evaluate(() =>
  document.querySelector('.fl-chip').getBoundingClientRect().height);
if (chipH < 44) fail('chips de filtre sous 44 px au pouce : ' + chipH);
if (!await mPage.$('.fl-chip[data-st="todo"]')) fail('le statut doit se filtrer en liste (mobile)');
await mPage.click('[data-dom="cyber"]');
await mPage.waitForFunction(() => document.querySelectorAll('#piBody .row-item').length === 2);
if (String(await names(mPage)) !== 'CyberVille,Cyberdef') fail('filtre domaine faux : ' + await names(mPage));
await mPage.click('[data-st="active"]');
await mPage.waitForFunction(() => document.querySelectorAll('#piBody .row-item').length === 1);
if (String(await names(mPage)) !== 'CyberVille') fail('filtre statut + domaine faux : ' + await names(mPage));
await mPage.screenshot({ path: SHOTS + '/85-pistes-filtre-mobile.png' });
await mPage.evaluate(async () => (await import('./ui/dom.js')).topSheet()?.close());

const filtBtn = await mPage.evaluate(() => {
  const b = document.querySelector('#piFilt');
  return { on: b.classList.contains('sort-on'), title: b.title };
});
if (!filtBtn.on || !/retaper/.test(filtBtn.title)) fail('bouton filtre muet : ' + JSON.stringify(filtBtn));
await mPage.click('#piFilt');       /* re-tap sur l'actif = tout montrer, sans feuille */
await mPage.waitForFunction(() => document.querySelectorAll('#piBody .row-item').length === 4);
if (await mPage.$('#piFilt.sort-on')) fail('le re-tap doit éteindre le filtre');
console.log('filtres mobiles : domaine + statut combinés, re-tap remontre tout ✓');

/* filtre sans résultat : l'écran explique et offre le retour en un tap */
await mPage.click('#piFilt');
await mPage.waitForSelector('[data-dom="sante"]');
await mPage.click('[data-dom="sante"]');
await mPage.evaluate(async () => (await import('./ui/dom.js')).topSheet()?.close());
await mPage.waitForSelector('#piFtClear');
if (!/Rien ne correspond au filtre/.test(await mPage.locator('.empty-list').innerText()))
  fail('vide filtré muet');
await mPage.click('#piFtClear');
await mPage.waitForFunction(() => document.querySelectorAll('#piBody .row-item').length === 4);
console.log('vide filtré : « Tout montrer » ramène tout ✓');
await mCtx.close();

/* ---------- ordinateur : statut au glisser sur le tableau ---------- */
const dCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const dPage = await dCtx.newPage();
watchErrors(dPage);
await seed(dPage);
await dPage.waitForSelector('.board');

/* la feuille desktop ne repropose pas le statut : les colonnes le font déjà */
await dPage.click('#piFilt');
await dPage.waitForSelector('.fl-chip');
if (await dPage.$('.fl-chip[data-st="todo"]')) fail('le statut ne se filtre pas sur le tableau (colonnes)');
await dPage.click('[data-dom="cyber"]');
await dPage.waitForFunction(() => document.querySelectorAll('#piBody .bcard').length === 2);
await dPage.evaluate(async () => (await import('./ui/dom.js')).topSheet()?.close());
await dPage.click('#piFilt');
await dPage.waitForFunction(() => document.querySelectorAll('#piBody .bcard').length === 4);
console.log('filtre desktop : domaine seul, appliqué au tableau ✓');

/* déposer « Cyberdef » (À contacter) dans « En cours » : la colonne
   s'allume au survol, le statut change, une entrée d'historique propre */
const dt = await dPage.evaluateHandle(() => new DataTransfer());
await dPage.dispatchEvent('.bcard[data-id="pi-a"]', 'dragstart', { dataTransfer: dt });
await dPage.dispatchEvent('.bcol[data-st="active"]', 'dragover', { dataTransfer: dt });
if (!await dPage.$('.bcol[data-st="active"].drop-ok')) fail('la colonne visée ne s’allume pas');
await dPage.waitForTimeout(350);     /* laisser passer le fondu d'entrée steps() de la vue */
await dPage.screenshot({ path: SHOTS + '/86-pistes-glisser-statut.png' });
await dPage.dispatchEvent('.bcol[data-st="active"]', 'drop', { dataTransfer: dt });
await dPage.waitForFunction(() =>
  !!document.querySelector('.bcol[data-st="active"] .bcard[data-id="pi-a"]'));
const moved = await dPage.evaluate(async () => {
  const { S } = await import('./ui/state.js');
  const c = S.companies.find(x => x.id === 'pi-a');
  return { status: c.status, hist: (c.history || []).map(h => h.t), toast: document.querySelector('#toast')?.textContent || '' };
});
if (moved.status !== 'active') fail('statut non changé au dépôt : ' + moved.status);
if (moved.hist.at(-1) !== 'Statut → En cours') fail('trace d’historique fausse : ' + moved.hist.join(' | '));
if (!/Cyberdef → En cours/.test(moved.toast)) fail('retour absent après dépôt : ' + moved.toast);

/* déposer dans SA colonne = aucun effet, aucune trace */
const dt2 = await dPage.evaluateHandle(() => new DataTransfer());
await dPage.dispatchEvent('.bcard[data-id="pi-a"]', 'dragstart', { dataTransfer: dt2 });
await dPage.dispatchEvent('.bcol[data-st="active"]', 'drop', { dataTransfer: dt2 });
const still = await dPage.evaluate(async () => {
  const { S } = await import('./ui/state.js');
  const c = S.companies.find(x => x.id === 'pi-a');
  return { status: c.status, n: (c.history || []).length };
});
if (still.status !== 'active' || still.n !== moved.hist.length)
  fail('le dépôt sur place ne doit rien écrire : ' + JSON.stringify(still));
console.log('tableau : glisser change le statut, trace propre, dépôt sur place inerte ✓');

/* le rechargement relit ce qui a été écrit (saveData réel, pas un état d’écran) —
   on attend d'abord que l'écriture ait vraiment atteint le stockage */
await dPage.waitForFunction(async () => {
  const st = await import('./engine/storage.js');
  const data = JSON.parse(await st.kvGet(st.DATA_KEY) || '[]');
  return data.find(x => x.id === 'pi-a')?.status === 'active';
});
await dPage.reload({ waitUntil: 'load' });
await dPage.waitForFunction(async () => {
  const { S } = await import('./ui/state.js');
  return S.companies.find(x => x.id === 'pi-a')?.status === 'active';
});
console.log('statut déposé relu après rechargement ✓');

/* thème sombre : mêmes écrans, rien ne disparaît */
await dPage.emulateMedia({ colorScheme: 'dark' });
await dPage.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await dPage.click('#piFilt');
await dPage.waitForSelector('.fl-chip');
await dPage.waitForTimeout(350);     /* fin du fondu d'entrée de la feuille */
await dPage.screenshot({ path: SHOTS + '/87-pistes-filtre-sombre.png' });
await dPage.evaluate(async () => (await import('./ui/dom.js')).topSheet()?.close());
await dCtx.close();

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
await browser.close();
server.close();
console.log(process.exitCode ? 'E2E pistes : ÉCHEC' : 'E2E pistes : OK');
