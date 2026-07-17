/* E2E P1 : création du verrou, scellement, rechargement → écran
   verrouillé, mauvais code, bon code, re-authentification.
   390×844 (tactile) puis 1280×800, thème clair puis sombre. */
import { chromium, chromiumPath, ROOT, SHOTS } from './outils.mjs';
import http from 'http';
import { readFile, stat } from 'fs/promises';
import path from 'path';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(await readFile(f));
  } catch (e) { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: chromiumPath() });
const errors = [];
let shot = 0;
const snap = (page, name) => page.screenshot({ path: `${SHOTS}/${String(++shot).padStart(2, '0')}-${name}.png` });
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

/* --- 1. sans verrou : Moi montre la ligne sobre --- */
await page.goto(base + '/#/moi', { waitUntil: 'load' });
await page.waitForSelector('#moiVerrou');
const label = await page.textContent('#view-moi .ec-row .ec-sub');
if (!/non protégé/.test(label)) fail('étiquette attendue « non protégé », vu : ' + label);
await snap(page, 'moi-non-protege');

/* pré-remplir une donnée pour vérifier le scellement */
await page.evaluate(() => {
  localStorage.setItem('oc_data_v3', JSON.stringify([{ id: 'seed1', name: 'Entreprise Témoin', city: 'Lille' }]));
});
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#moiVerrou');

/* --- 2. parcours de création --- */
await page.click('#moiVerrou');
await page.waitForSelector('.modal');
await snap(page, 'protege-intro');
await page.click('.modal-f .btn-primary');           /* Choisir mon code */
const tapCode = async code => {
  for (const d of code) await page.click(`.modal .pad-k[data-d="${d}"]`);
};
await page.waitForSelector('.modal .pad-k');
await tapCode('123456');                              /* trivial → refusé */
await page.waitForTimeout(200);
const weakMsg = await page.textContent('.modal .lock-msg');
if (!/facile/.test(weakMsg)) fail('code trivial non refusé : ' + weakMsg);
await tapCode('280941');
await page.waitForTimeout(200);
await tapCode('280941');                              /* confirmation */
await page.waitForSelector('.phrase-grid');
await snap(page, 'phrase-de-secours');
const words = await page.$$eval('.phrase-grid li', els => els.map(e => e.textContent.trim()));
if (words.length !== 12) fail('12 mots attendus, vu ' + words.length);
await page.click('.modal-f .btn-primary');            /* Je l'ai écrite */
await page.waitForSelector('#vw1');
const n1 = +(await page.textContent('label[for="vw1"]')).replace(/\D/g, '') - 1;
const n2 = +(await page.textContent('label[for="vw2"]')).replace(/\D/g, '') - 1;
await page.fill('#vw1', words[n1]);
await page.fill('#vw2', words[n2]);
await page.click('.modal-f .btn-primary');            /* Continuer */
await page.waitForSelector('.modal-f .btn-primary');  /* Télécharger */
const dl = page.waitForEvent('download');
await page.click('.modal-f .btn-primary');
await dl;
await snap(page, 'sauvegarde-bloquante');
/* Terminer devient actif après le téléchargement */
await page.click('.modal-f button:has-text("Terminer"):not([disabled])');
await page.waitForSelector('.toast.on', { timeout: 15000 });
/* refuser la biométrie si proposée */
const bioSheet = await page.$('.modal-confirm');
if (bioSheet) await page.click('.modal-f .btn-ghost');
await page.waitForTimeout(400);
const lbl2 = await page.textContent('#view-moi .ec-row .ec-sub');
if (!/protégé — se verrouille seul/.test(lbl2)) fail('étiquette après création : ' + lbl2);
await snap(page, 'moi-protege');

/* --- 3. le scellement est réel --- */
const sealed = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const o = indexedDB.open('oc_kv_v1', 1);
    o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error);
  });
  const v = await new Promise((res, rej) => {
    const rq = db.transaction('kv').objectStore('kv').get('oc_data_v3');
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
  return { data: String(v || '').slice(0, 5), meta: !!await new Promise((res) => {
    const rq = db.transaction('kv').objectStore('kv').get('oc_vault_v1');
    rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
  }) };
});
if (sealed.data !== 'OCV1.') fail('oc_data_v3 non scellée : ' + sealed.data);
if (!sealed.meta) fail('oc_vault_v1 absente');
console.log('scellement vérifié : oc_data_v3 =', sealed.data + '…');

/* --- 4. rechargement → écran verrouillé --- */
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.lock');
await snap(page, 'verrouille-mobile-clair');
const tapLock = async code => { for (const d of code) await page.click(`.lock .pad-k[data-d="${d}"]`); };
await tapLock('999999');
await page.waitForFunction(() => (document.querySelector('.lock .lock-msg') || {}).textContent, null, { timeout: 10000 });
const err = await page.textContent('.lock .lock-msg');
if (!/pas ça/.test(err)) fail('mauvais code : message manquant, vu : ' + err);
await snap(page, 'verrouille-mauvais-code');
await tapLock('280941');
await page.waitForSelector('#view-moi:not([hidden]), #view-aujourdhui:not([hidden])', { timeout: 10000 });
const opened = await page.evaluate(() => !document.querySelector('.lock'));
if (!opened) fail('déverrouillage sans effet');
console.log('déverrouillage OK ; la donnée témoin est relue :',
  await page.evaluate(async () => (JSON.parse(await (await import('./engine/storage.js')).kvGet('oc_data_v3')))[0].name));

/* --- 5. re-authentification d'un geste sensible --- */
await page.goto(base + '/#/moi');
await page.click('#moiRestore');
await page.waitForSelector('.modal-confirm .pad-k');
await snap(page, 'reauth-restaurer');
await page.keyboard.press('Escape');

/* --- 6. thème sombre + ordinateur --- */
await page.click('#btnTheme');
await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
await page.waitForTimeout(600);        /* laisser l'écriture IndexedDB aboutir */
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.lock');
if (await page.evaluate(() => document.documentElement.dataset.theme) !== 'dark') fail('thème sombre non persisté');
await snap(page, 'verrouille-mobile-sombre');
await tapLock('280941');
await page.waitForFunction(() => !document.querySelector('.lock'), null, { timeout: 10000 });
/* ordinateur : même contexte, viewport élargi, saisie CLAVIER */
await page.setViewportSize({ width: 1280, height: 800 });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.lock');
await snap(page, 'verrouille-desktop-sombre');
await page.keyboard.type('280941');
await page.waitForFunction(() => !document.querySelector('.lock'), null, { timeout: 10000 });
console.log('desktop clavier : déverrouillé ✓');
await page.waitForTimeout(300);
await snap(page, 'desktop-moi-sombre');

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
await browser.close();
server.close();
console.log(process.exitCode ? 'E2E : ÉCHEC' : 'E2E : OK');
