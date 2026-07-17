/* E2E P8-1 : « Depuis mes e-mails » — prompt copié, résultat collé,
   aperçu MULTI-SÉLECTION (une proposition d'IA se trie), fusion des
   seules pistes cochées, Annuler ~30 s. */
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true,
  permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };

await page.goto(base + '/#/echanger', { waitUntil: 'load' });
await page.waitForTimeout(800);
await page.evaluate(async () => {
  const { openRecevoir } = await import('./ui/recevoir.js');
  openRecevoir();
});
await page.waitForSelector('#rcMails');
await page.click('#rcMails');
await page.waitForSelector('#rcMailTxt');
await page.waitForTimeout(350);
await page.screenshot({ path: SHOTS + '/50-depuis-mes-emails.png' });

/* copier le prompt : le presse-papier reçoit le prompt du profil */
await page.click('.modal-f button:has-text("Copier le prompt")');
const clip = await page.evaluate(() => navigator.clipboard.readText());
if (!/JSON|piste|entreprise/i.test(clip)) fail('prompt copié inattendu : ' + clip.slice(0, 60));
console.log('prompt copié depuis le profil ✓');

/* coller un « résultat d'IA » : 3 pistes, dont une piégée (lien js:) */
const payload = JSON.stringify({ v: 4, app: 'test', kind: 'share', companies: [
  { name: 'Sopra Steria', city: 'Lille', contacts: [{ name: 'Iris', email: 'iris@soprasteria.com', link: 'javascript:alert(1)' }] },
  { name: 'Decathlon Tech', city: 'Lille' },
  { name: 'Exotec', city: 'Croix' }
] });
await page.fill('#rcMailTxt', payload);
await page.click('.modal-f .btn-primary:has-text("Lire")');
await page.waitForSelector('[data-sel]');
const nSel = await page.$$eval('[data-sel]', els => els.length);
if (nSel !== 3) fail('3 propositions attendues, vu ' + nSel);
const goLabel1 = await page.textContent('.modal-f .btn-primary');
if (!/Fusionner \(3\)/.test(goLabel1)) fail('libellé attendu Fusionner (3), vu ' + goLabel1);
/* écarter Decathlon Tech */
await page.click('[data-sel]:has-text("Decathlon Tech")');
const goLabel2 = await page.textContent('.modal-f .btn-primary');
if (!/Fusionner \(2\)/.test(goLabel2)) fail('libellé attendu Fusionner (2), vu ' + goLabel2);
await page.waitForTimeout(350);
await page.screenshot({ path: SHOTS + '/51-apercu-tri.png' });
await page.click('.modal-f .btn-primary');
await page.waitForSelector('.undo-bar');
console.log('fusion triée + barre Annuler ✓');

const state = await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  const data = JSON.parse(await st.kvGet(st.DATA_KEY));
  return {
    names: data.map(c => c.name).sort(),
    link: (data.find(c => c.name === 'Sopra Steria').contacts[0] || {}).link || '',
    conf: (data.find(c => c.name === 'Sopra Steria').contacts[0] || {}).conf || ''
  };
});
if (state.names.join(',') !== 'Exotec,Sopra Steria') fail('pistes fusionnées : ' + state.names.join(','));
if (/javascript:/i.test(state.link)) fail('lien piégé non neutralisé : ' + state.link);
if (state.conf === 'ok') fail('confiance transmise à tort');
console.log('2 cochées fusionnées, l’écartée absente, lien piégé neutralisé ✓');

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
await browser.close();
server.close();
console.log(process.exitCode ? 'E2E analyse : ÉCHEC' : 'E2E analyse : OK');
