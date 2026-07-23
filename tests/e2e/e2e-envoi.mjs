/* E2E P4 : envoi direct — feuille Écrire connectée (Envoyer primaire,
   adresse visible), envoi intercepté au niveau réseau (jamais de vrai
   Gmail), boucle « Envoyé ✓ — et ensuite ? », jeton expiré → feuille
   Reconnecter SANS perte du brouillon, ligne Connexions dans Moi. */
import { chromium, chromiumPath, ROOT, SHOTS, attendre, ouvrirReglages } from './outils.mjs';
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
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };

/* interception : le « Gmail » de test confirme l'envoi, on capture le corps */
let sent = null;
await page.route('https://gmail.googleapis.com/**', async route => {
  sent = JSON.parse(route.request().postData() || '{}');
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"m1"}' });
});

/* mise en place : une piste avec contact + connexion Gmail « valide » */
await page.goto(base, { waitUntil: 'load' });
await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  await st.kvInit();                    /* attendre le vrai backend avant de semer */
  await st.kvSet(st.DATA_KEY, JSON.stringify([{
    id: 'p1', name: 'Orange Cyberdefense', city: 'Lille', status: 'todo',
    contacts: [{ id: 'k1', name: 'Nadia', role: 'RH', email: 'nadia@exemple.fr' }], updatedAt: 1
  }]));
  await st.kvSet(st.MAIL_KEY, JSON.stringify({
    gmail: { token: 'FAKE', exp: Date.now() + 3600000, email: 'mahe@gmail.com' }
  }));
});
await page.reload({ waitUntil: 'load' });

/* Moi : la ligne Connexions montre l'adresse */
await page.goto(base + '/#/moi');
await ouvrirReglages(page);
await page.waitForSelector('#moiCx');
const cxLabel = await page.evaluate(() =>
  document.querySelector('#moiCx').closest('.ec-row').querySelector('.ec-sub').textContent);
if (!/Gmail — mahe@gmail.com/.test(cxLabel)) fail('ligne Connexions : ' + cxLabel);

/* Écrire depuis la fiche : Envoyer primaire + « Depuis » visible */
await page.goto(base + '/#/pistes');
await page.waitForSelector('.pi-item, .pl-item, [data-cid], .card', { timeout: 8000 }).catch(() => {});
await attendre(page, async () => (await import('./ui/state.js')).S.companies.length > 0, { timeout: 10000 });
await page.evaluate(async () => {
  const { openMail } = await import('./ui/mail.js');
  const { S } = await import('./ui/state.js');
  openMail(S.companies[0]);
});
await page.waitForSelector('#mSubj');
const hint = await page.textContent('#mHint');
if (!/Depuis mahe@gmail.com/.test(hint)) fail('adresse d’envoi absente : ' + hint);
const sendBtn = await page.$('.modal-f .btn-primary:has-text("Envoyer")');
if (!sendBtn) fail('bouton Envoyer primaire absent');
await page.waitForTimeout(350); await page.screenshot({ path: SHOTS + '/20-ecrire-connecte.png' });

/* envoi → interception → boucle « Envoyé ✓ — et ensuite ? » */
await page.fill('#mSubj', 'Candidature — stage cyber été');
await sendBtn.click();
await page.waitForSelector('.modal:has-text("Envoyé ✓ — et ensuite ?")', { timeout: 10000 });
if (!sent || !sent.raw) fail('requête Gmail non capturée');
const mime = Buffer.from(sent.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
if (!/To: nadia@exemple.fr/.test(mime)) fail('destinataire absent du MIME');
if (!/Subject: =\?UTF-8\?B\?/.test(mime)) fail('objet accentué non encodé');
console.log('envoi intercepté : MIME correct (To + Subject UTF-8) ✓');
await page.waitForTimeout(350); await page.screenshot({ path: SHOTS + '/21-envoye-et-ensuite.png' });
await page.keyboard.press('Escape');

/* le statut de la piste a suivi */
const status = await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  await st.kvInit();                    /* attendre le vrai backend avant de semer */
  return JSON.parse(await st.kvGet(st.DATA_KEY))[0].status;
});
if (status !== 'active') fail('statut attendu active, vu ' + status);

/* jeton expiré : Reconnecter s'empile, le brouillon ne bouge pas */
await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  await st.kvInit();                    /* attendre le vrai backend avant de semer */
  const m = JSON.parse(await st.kvGet(st.MAIL_KEY));
  m.gmail.exp = Date.now() - 1000;
  await st.kvSet(st.MAIL_KEY, JSON.stringify(m));
});
await page.reload({ waitUntil: 'load' });
await attendre(page, async () => (await import('./ui/state.js')).S.companies.length > 0, { timeout: 10000 });
await page.evaluate(async () => {
  const { openMail } = await import('./ui/mail.js');
  const { S } = await import('./ui/state.js');
  openMail(S.companies[0]);
});
await page.waitForSelector('#mSubj');
await page.fill('#mSubj', 'BROUILLON PRÉCIEUX');
await page.click('.modal-f .btn-primary:has-text("Envoyer")');
await page.waitForSelector('.modal:has-text("Gmail demande de te reconnecter")', { timeout: 10000 });
await page.waitForTimeout(350); await page.screenshot({ path: SHOTS + '/22-reconnecter.png' });
await page.keyboard.press('Escape');
const draft = await page.inputValue('#mSubj');
if (draft !== 'BROUILLON PRÉCIEUX') fail('brouillon perdu : ' + draft);
console.log('expiration : reconnexion proposée, brouillon intact ✓');

/* sans connexion : le pied historique + l'invitation discrète */
await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  await st.kvInit();                    /* attendre le vrai backend avant de semer */
  await st.kvSet(st.MAIL_KEY, '');
});
await page.reload({ waitUntil: 'load' });
await attendre(page, async () => (await import('./ui/state.js')).S.companies.length > 0, { timeout: 10000 });
await page.evaluate(async () => {
  const { openMail } = await import('./ui/mail.js');
  const { S } = await import('./ui/state.js');
  openMail(S.companies[0]);
});
await page.waitForSelector('#mDirect');
const classic = await page.$('.modal-f a.btn-primary:has-text("Ouvrir dans Mail")');
if (!classic) fail('pied historique absent sans connexion');
console.log('sans connexion : mailto primaire + invitation discrète ✓');

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
await browser.close();
server.close();
console.log(process.exitCode ? 'E2E envoi : ÉCHEC' : 'E2E envoi : OK');
