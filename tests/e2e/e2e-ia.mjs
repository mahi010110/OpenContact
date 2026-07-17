/* E2E P6 : brouillon IA dans le composeur — proposition interceptée,
   texte dans le champ éditable (relecture par construction), erreurs
   quota/clé explicites, gabarit jamais perdu. */
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
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
const errors = [];
page.on('console', m => {
  /* le 429 injecté par le test produit son propre log réseau — attendu */
  if (m.type() === 'error' && !/429|Too Many Requests/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', e => errors.push(String(e)));
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };

let mode = 'ok', captured = null;
await page.route('https://api.anthropic.com/**', async route => {
  captured = JSON.parse(route.request().postData() || '{}');
  if (mode === 'quota') return route.fulfill({ status: 429, contentType: 'application/json', body: '{}' });
  await route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ content: [{ type: 'text', text: 'Bonjour Nadia,\n\nBrouillon proposé par le test.\n\nMahé' }] }) });
});

await page.goto(base, { waitUntil: 'load' });
await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  await st.kvInit();                    /* attendre le vrai backend avant de semer */
  await st.kvSet(st.DATA_KEY, JSON.stringify([{
    id: 'p1', name: 'Orange Cyberdefense', city: 'Lille', status: 'todo',
    contacts: [{ id: 'k1', name: 'Nadia', role: 'RH', email: 'nadia@exemple.fr' }], updatedAt: 1 }]));
  await st.kvSet(st.AI_KEY, JSON.stringify({ provider: 'anthropic', key: 'sk-test' }));
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(async () => (await import('./ui/state.js')).S.companies.length > 0, null, { timeout: 10000 });
const dbg = await page.evaluate(async () => {
  const { S } = await import('./ui/state.js');
  const st = await import('./engine/storage.js');
  return { n: S.companies.length, raw: String(await st.kvGet(st.DATA_KEY)).slice(0, 60) };
});
console.log('debug état :', JSON.stringify(dbg));
await page.evaluate(async () => {
  const { openMail } = await import('./ui/mail.js');
  const { S } = await import('./ui/state.js');
  openMail(S.companies[0]);
});
await page.waitForSelector('#mAi');
const before = await page.inputValue('#mBody');
await page.click('#mAi');
await page.waitForFunction(() => /Brouillon proposé par le test/.test(document.querySelector('#mBody').value), null, { timeout: 10000 });
if (!captured || !/Orange Cyberdefense/.test(JSON.stringify(captured))) fail('contexte de la piste absent du prompt');
if (/notes|suivi/.test(JSON.stringify(captured).toLowerCase())) fail('du privé serait parti !');
console.log('brouillon IA : texte dans le champ éditable, contexte piste seulement ✓');
await page.waitForTimeout(350);
await page.screenshot({ path: SHOTS + '/40-brouillon-ia.png' });

/* quota : message court, le texte en place ne bouge pas */
mode = 'quota';
await page.click('#mAi');
await page.waitForSelector('.toast.on');
const toastTxt = await page.textContent('#toast');
if (!/Quota IA atteint/.test(toastTxt)) fail('message quota : ' + toastTxt);
const after = await page.inputValue('#mBody');
if (!/Brouillon proposé par le test/.test(after)) fail('le texte a été perdu sur erreur');
console.log('quota : message court, rien de perdu ✓');

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
await browser.close();
server.close();
console.log(process.exitCode ? 'E2E IA : ÉCHEC' : 'E2E IA : OK');
