/* E2E P5 : campagne bout en bout — bifurcation Prospecter, assistant
   (message → contrôle → validation), ligne groupée dans Aujourd'hui,
   feuille du jour, « Tout envoyer » intercepté, arrêt sur réponse. */
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
/* heure figée : jeudi 10 h — DANS la fenêtre d'envoi (lun–ven 8-19 h),
   pour que le test passe quel que soit le moment où il tourne */
await page.clock.setFixedTime(new Date('2026-07-16T10:00:00'));
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };
const settle = async name => { await page.waitForTimeout(350); await page.screenshot({ path: SHOTS + '/' + name + '.png' }); };

const sends = [];
await page.route('https://gmail.googleapis.com/**', async route => {
  sends.push(JSON.parse(route.request().postData() || '{}'));
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"m"}' });
});

/* 3 pistes : 2 avec email, 1 sans ; Gmail « connecté » */
await page.goto(base, { waitUntil: 'load' });
await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  await st.kvInit();                    /* attendre le vrai backend avant de semer */
  await st.kvSet(st.DATA_KEY, JSON.stringify([
    { id: 'p1', name: 'Orange Cyberdefense', city: 'Lille', status: 'todo',
      contacts: [{ id: 'k1', name: 'Nadia', role: 'RH', email: 'nadia@exemple.fr' }], updatedAt: 1 },
    { id: 'p2', name: 'OVHcloud', city: 'Roubaix', status: 'todo',
      contacts: [{ id: 'k2', name: 'Théo', email: 'theo@exemple.fr' }], updatedAt: 1 },
    { id: 'p3', name: 'Damart DSI', city: 'Roubaix', status: 'todo', contacts: [], updatedAt: 1 }
  ]));
  await st.kvSet(st.MAIL_KEY, JSON.stringify({
    gmail: { token: 'FAKE', exp: Date.now() + 3600000, email: 'mahe@gmail.com' } }));
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(async () => (await import('./ui/state.js')).S.companies.length === 3, null, { timeout: 10000 });

/* Prospecter → tout cocher → Continuer → bifurcation */
await page.goto(base + '/#/pistes');
await page.click('#piProspect');
await page.waitForSelector('.pk');
await page.click('#pkAllTodo');
await page.click('.modal-f .btn-primary');
await page.waitForSelector('#pmCamp');
await settle('30-bifurcation');
await page.click('#pmCamp');

/* assistant : message → contrôle */
await page.waitForSelector('#czName');
await settle('31-campagne-message');
await page.click('.modal-f .btn-primary');            /* Vérifier la campagne */
await page.waitForSelector('.cz-recap');
const recap = await page.textContent('.cz-recap');
if (!/2 pistes/.test(recap)) fail('recap : ' + recap);
if (!/Depuis/.test(recap) || !/mahe@gmail.com/.test(recap)) fail('adresse d’envoi absente du contrôle');
const warn = await page.textContent('.modal .hint.warn').catch(() => '');
if (!/1 piste sans email/.test(warn) || !/Damart/.test(warn)) fail('piste écartée non montrée : ' + warn);
await settle('32-campagne-controle');
await page.click('.modal-f .btn-primary');            /* Valider */
await page.waitForSelector('.toast.on');

/* Aujourd'hui : la ligne groupée */
await page.goto(base + '/#/aujourdhui');
await page.waitForSelector('.camp-line');
const line = await page.textContent('.camp-line');
if (!/2 envois prêts/.test(line)) fail('ligne du jour : ' + line);
await settle('33-aujourdhui-ligne');

/* feuille du jour : aperçu exact + Tout envoyer */
await page.click('.camp-line');
await page.waitForSelector('.camp-send');
const nDue = await page.$$eval('.camp-send', els => els.length);
if (nDue !== 2) fail('2 envois attendus, vu ' + nDue);
await page.click('.camp-send summary .cs-m');          /* déplier l'aperçu */
const body = await page.textContent('.camp-send .cs-body');
if (!/je m’arrête là/.test(body)) fail('mention d’opposition absente de l’aperçu');
if (!/Nadia|Théo/.test(body)) fail('personnalisation absente : ' + body.slice(0, 80));
await settle('34-feuille-du-jour');

/* hors fenêtre (samedi) : les envois restent visibles mais retenus */
await page.clock.setFixedTime(new Date('2026-07-18T10:00:00'));
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.camp-send'), null, { timeout: 5000 });
await page.click('.camp-line');
await page.waitForSelector('.camp-send');
if (!(await page.$eval('.camp-send [data-send]', b => b.disabled)))
  fail('hors fenêtre : le bouton Envoyer devrait être retenu');
const offHint = await page.textContent('.modal .hint.warn').catch(() => '');
if (!/lundi au vendredi/.test(offHint)) fail('hors fenêtre : rappel absent — ' + offHint);
if (await page.$('.modal-f .btn-primary')) fail('hors fenêtre : « Tout envoyer » ne devrait pas être offert');
console.log('fenêtre d’envoi respectée (samedi = retenu) ✓');
await settle('34b-hors-fenetre');
/* retour jeudi 10 h : tout repart */
await page.clock.setFixedTime(new Date('2026-07-16T10:00:00'));
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.camp-send'), null, { timeout: 5000 });
await page.click('.camp-line');
await page.waitForSelector('.camp-send');
await page.click('.modal-f .btn-primary');             /* Tout envoyer (2) */
await page.waitForFunction(() => document.querySelectorAll('.camp-send').length === 0, null, { timeout: 15000 });
if (sends.length !== 2) fail('2 envois interceptés attendus, vu ' + sends.length);
console.log('2 envois interceptés ✓ — la feuille affiche « c’est tout pour aujourd’hui »');
await settle('35-tout-envoye');
await page.keyboard.press('Escape');

/* la ligne du jour a disparu (plus rien de dû), l'historique des fiches a suivi */
await page.waitForFunction(() => !document.querySelector('.camp-line'), null, { timeout: 5000 });
const hist = await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  const data = JSON.parse(await st.kvGet(st.DATA_KEY));
  return { h: data[0].history.map(x => x.t), status: data[0].status };
});
if (!hist.h.some(t => /Campagne « .* » — message envoyée? à Nadia/.test(t))) fail('historique fiche : ' + hist.h.join(' | '));
if (hist.status !== 'active') fail('statut piste : ' + hist.status);

/* réponse marquée sur la fiche → relances annulées (réconciliation) */
await page.evaluate(async () => {
  const { S, saveData } = await import('./ui/state.js');
  S.companies[0].status = 'reply';
  S.companies[0].updatedAt = Date.now();
  saveData();
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(async () => (await import('./ui/state.js')).S.companies.length === 3, null, { timeout: 10000 });
await page.goto(base + '/#/aujourdhui');
await page.waitForTimeout(600);
const campState = await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  const cs = JSON.parse(await st.kvGet(st.CAMPAIGNS_KEY));
  const t = cs[0].targets.find(t => t.cid === 'p1');
  return { tState: t.state, hist: JSON.parse(await st.kvGet(st.DATA_KEY))[0].history.map(x => x.t) };
});
if (campState.tState !== 'replied') fail('cible p1 attendue replied, vu ' + campState.tState);
if (!campState.hist.some(t => /arrêtée — réponse reçue/.test(t))) fail('trace d’arrêt absente');
console.log('réponse → relances annulées, trace dans l’historique ✓');

/* le board desktop montre « en campagne » */
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(base + '/#/pistes');
await page.waitForSelector('.board');
const cardTxt = await page.evaluate(() => document.querySelector('.board').textContent);
if (!/en campagne/.test(cardTxt)) fail('tag « en campagne » absent du board');
await settle('36-board-en-campagne');

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
await browser.close();
server.close();
console.log(process.exitCode ? 'E2E campagne : ÉCHEC' : 'E2E campagne : OK');
