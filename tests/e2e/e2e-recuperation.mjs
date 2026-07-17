/* E2E P2-3 : récupération d'urgence complète (D7) — phrase → annonce →
   nouveau code → nouvelle phrase → rotation/rescellement → sauvegarde
   bloquante → déverrouillé, anneau repris, génération +1. */
import { chromium, chromiumPath, ROOT, SHOTS } from './outils.mjs';
import http from 'http';
import { readFile } from 'fs/promises';
import path from 'path';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(await readFile(path.join(ROOT, p)));
  } catch (e) { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, acceptDownloads: true })).newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };

/* mise en place directe par le moteur : coffre + donnée scellée + anneau */
await page.goto(base, { waitUntil: 'load' });
const oldPhrase = await page.evaluate(async () => {
  const v = await import('./engine/vault.js');
  const st = await import('./engine/storage.js');
  await st.kvInit();                    /* attendre le vrai backend avant de semer */
  const phrase = v.makeVaultPhrase();
  const { meta, key } = await v.createVault('280941', phrase, { iter: 15000 });
  await st.kvSet(st.VAULT_KEY, JSON.stringify(meta));
  await st.kvSet(st.DATA_KEY, JSON.stringify([{ id: 'x1', name: 'Témoin', city: 'Lille', updatedAt: 1 }]));
  st.vaultAttach(key);
  await st.vaultSealAll();
  const sy = await import('./ui/synclive.js');
  await sy.ensureRing(phrase);
  st.vaultDetach();
  return phrase;
});
console.log('coffre + anneau posés ; ancienne phrase :', oldPhrase.split(' ').slice(0, 2).join(' ') + '…');

await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.lock');
await page.click('#lkForgot');
await page.waitForSelector('#rcPhrase');
await page.fill('#rcPhrase', oldPhrase.toUpperCase());          /* tolérance de casse */
await page.click('.modal-f .btn-primary');                       /* Vérifier */
await page.waitForSelector('.lk-why', { timeout: 20000 });       /* annonce D7 */
await page.click('.modal-f .btn-primary');                       /* Continuer */
await page.waitForSelector('.modal .pad-k');
const tap = async code => { for (const d of code) await page.click(`.modal .pad-k[data-d="${d}"]`); };
await tap('731945');
await page.waitForTimeout(250);
await tap('731945');
await page.waitForSelector('.phrase-grid', { timeout: 20000 });
const words = await page.$$eval('.phrase-grid li', els => els.map(e => e.textContent.trim()));
if (words.length !== 12) fail('12 mots attendus');
if (words.join(' ') === oldPhrase) fail('la phrase n’a pas été renouvelée');
await page.click('.modal-f .btn-primary');                       /* Je l'ai écrite */
await page.waitForSelector('#vw1');
const n1 = +(await page.textContent('label[for="vw1"]')).replace(/\D/g, '') - 1;
const n2 = +(await page.textContent('label[for="vw2"]')).replace(/\D/g, '') - 1;
await page.fill('#vw1', words[n1]);
await page.fill('#vw2', words[n2]);
await page.click('.modal-f .btn-primary');                       /* Continuer → rotation */
await page.waitForSelector('.modal-f button:has-text("Télécharger")', { timeout: 30000 });
const dl = page.waitForEvent('download');
await page.click('.modal-f button:has-text("Télécharger")');
await dl;
await page.click('.modal-f button:has-text("Terminer"):not([disabled])');
await page.waitForFunction(() => !document.querySelector('.lock'), null, { timeout: 15000 });

const check = await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  const meta = JSON.parse(await st.kvGet(st.VAULT_KEY));
  const data = JSON.parse(await st.kvGet(st.DATA_KEY));
  const ringSt = JSON.parse(await st.kvGet(st.RING_KEY));
  const self = JSON.parse(await st.kvGet(st.DEVICE_KEY));
  return { gen: meta.gen, name: data[0].name, ringGen: ringSt.ring.gen, main: ringSt.ring.main, selfId: self.id };
});
if (check.gen !== 2) fail('génération du coffre attendue 2, vu ' + check.gen);
if (check.name !== 'Témoin') fail('donnée re-scellée illisible');
if (check.ringGen !== 2) fail('génération de l’anneau attendue 2, vu ' + check.ringGen);
if (check.main !== check.selfId) fail('cet appareil devrait être principal');
console.log('récupération : coffre gen', check.gen, '· anneau gen', check.ringGen, '· principal = cet appareil ✓');

/* le nouveau code déverrouille après rechargement, l'ancien non */
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.lock');
const tapLock = async code => { for (const d of code) await page.click(`.lock .pad-k[data-d="${d}"]`); };
await tapLock('280941');
await page.waitForFunction(() => (document.querySelector('.lock .lock-msg') || {}).textContent, null, { timeout: 10000 });
await tapLock('731945');
await page.waitForFunction(() => !document.querySelector('.lock'), null, { timeout: 10000 });
console.log('ancien code refusé, nouveau code accepté ✓');

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
await browser.close();
server.close();
console.log(process.exitCode ? 'E2E récupération : ÉCHEC' : 'E2E récupération : OK');
