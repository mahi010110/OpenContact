/* E2E C3+C4 : la campagne confiée, exécutée par le VRAI Compagnon.
   Le binaire Tauri tourne sous xvfb (crochets de développement :
   OC_APPAIRAGE_AUTO, OC_SMTP_TEST → puits local, OC_TICK_MS,
   OC_FENETRE_TEST). La PWA s'appaire, confie une campagne par
   l'assistant (« Mon ordinateur envoie tout seul »), le Compagnon
   envoie en SMTP réel vers le puits, on le TUE et on le relance —
   zéro doublon (journal persisté scellé) — puis la PWA replie le
   rapport et reprend la main.
   Prérequis : `cargo build -p oc-compagnon` fait (tous.mjs le saute
   proprement si le binaire manque). */
import { chromium, chromiumPath, SHOTS, serveRepo, ROOT, attendre as attendrePage } from './outils.mjs';
import { spawn } from 'child_process';
import { existsSync, mkdtempSync } from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

const BIN = path.join(ROOT, 'compagnon', 'target', 'debug', 'oc-compagnon');
if (!existsSync(BIN)){
  console.log('binaire absent (cargo build -p oc-compagnon) — scénario sauté');
  process.exit(0);
}

/* ---------- le puits SMTP : ce que « envoyé » veut dire ---------- */
const messages = [];
const sink = net.createServer(sock => {
  let buf = '', inData = false, cur = { to: [], data: '' };
  sock.write('220 puits local\r\n');
  sock.on('data', d => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0){
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (inData){
        if (line === '.'){ inData = false; messages.push(cur); cur = { to: [], data: '' }; sock.write('250 ok\r\n'); }
        else cur.data += line + '\n';
        continue;
      }
      const u = line.toUpperCase();
      if (u.startsWith('EHLO') || u.startsWith('HELO')) sock.write('250-puits\r\n250 OK\r\n');
      else if (u.startsWith('RCPT TO')){ cur.to.push(line); sock.write('250 ok\r\n'); }
      else if (u === 'DATA'){ inData = true; sock.write('354 go\r\n'); }
      else if (u === 'QUIT'){ sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 ok\r\n');
    }
  });
});
await new Promise(r => sink.listen(2525, '127.0.0.1', r));

/* ---------- le vrai Compagnon, crochets de développement ---------- */
const xdg = mkdtempSync(path.join(os.tmpdir(), 'oc-compagnon-e2e-'));
const CODE = 'ABCD-2345';
let compagnon = null;
function lancer(){
  compagnon = spawn('xvfb-run', ['-a', 'dbus-run-session', '--', BIN], {
    env: Object.assign({}, process.env, {
      XDG_DATA_HOME: xdg,
      OC_APPAIRAGE_AUTO: CODE,
      OC_SMTP_TEST: '127.0.0.1:2525',
      OC_TICK_MS: '1200',
      OC_FENETRE_TEST: '1',
      OC_INTEGRATION_TEST: '1'
    }),
    stdio: ['ignore', 'pipe', 'pipe'], detached: true
  });
  compagnon.stdout.on('data', d => process.stdout.write('[compagnon] ' + d));
  compagnon.stderr.on('data', () => {});
}
const arreter = () => { try { process.kill(-compagnon.pid, 'SIGKILL'); } catch (e) {} };
const attendre = async (fn, ms, quoi) => {
  const t0 = Date.now();
  for (;;){
    if (await fn()) return;
    if (Date.now() - t0 > ms) throw new Error('attente : ' + quoi);
    await new Promise(r => setTimeout(r, 400));
  }
};
const sonde = async () => {
  for (const port of [17095, 17096, 17097]){
    try {
      const r = await fetch(`http://127.0.0.1:${port}/oc-compagnon`, { signal: AbortSignal.timeout(800) });
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  return null;
};
lancer();
await attendre(async () => { const i = await sonde(); return i && i.appairage; }, 30000, 'canal du Compagnon');
console.log('vrai Compagnon lancé, appairage ouvert ✓');

/* ---------- la PWA ---------- */
const { server, base } = await serveRepo();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };
const tapIn = async (scope, code) => { for (const d of code) await page.click(`${scope} .pad-k[data-d="${d}"]`); };
const deverrouiller = async () => {
  await page.waitForSelector('.lock .pad-k');
  await tapIn('.lock', '280941');
  await page.waitForFunction(() => !document.querySelector('.lock'), null, { timeout: 10000 });
};

await page.goto(base, { waitUntil: 'load' });
await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  await st.kvInit();
  await st.kvSet(st.DATA_KEY, JSON.stringify([
    { id: 'p1', name: 'Orange Cyberdefense', city: 'Lille', status: 'todo',
      contacts: [{ id: 'k1', name: 'Nadia', role: 'RH', email: 'nadia@exemple.fr' }], updatedAt: 1 },
    { id: 'p2', name: 'OVHcloud', city: 'Roubaix', status: 'todo',
      contacts: [{ id: 'k2', name: 'Théo', email: 'theo@exemple.fr' }], updatedAt: 1 }
  ]));
  const { createVault, makeVaultPhrase } = await import('./engine/vault.js');
  const made = await createVault('280941', makeVaultPhrase(), { iter: 15000 });
  await st.kvSet(st.VAULT_KEY, JSON.stringify(made.meta));
  localStorage.setItem('t_phrase', makeVaultPhrase());
});
await page.reload({ waitUntil: 'load' });
await deverrouiller();
await page.evaluate(async () => (await import('./ui/synclive.js')).ensureRing(localStorage.getItem('t_phrase')));

/* appairage réel (le parcours UI est couvert par e2e-compagnon.mjs) */
await page.evaluate(async code => {
  const { probeCompanion, pairCompanion } = await import('./engine/companion.js');
  const st = await import('./engine/storage.js');
  const { deviceSelf, ensureKeys, getRing, ringAddCompanion } = await import('./ui/synclive.js');
  const found = await probeCompanion();
  const self = await deviceSelf();
  const keys = await ensureKeys();
  const rep = await pairCompanion(found.base, code, found.info.appairage.s,
    { id: self.id, name: self.name, pub: keys.pub }, getRing());
  await st.kvSet(st.COMPANION_KEY, JSON.stringify({
    k: rep.k, id: rep.compagnon.id, nom: rep.compagnon.name, pub: rep.compagnon.pub, at: Date.now() }));
  await ringAddCompanion({ id: rep.compagnon.id, name: rep.compagnon.name, pub: rep.compagnon.pub });
}, CODE);
console.log('appairé au vrai Compagnon ✓');

/* la campagne, par l'assistant — « Mon ordinateur envoie tout seul » */
await page.goto(base + '/#/pistes');
await page.click('#piProspect');
await page.waitForSelector('.pk');
await page.click('#pkAllTodo');
await page.click('.modal-f .btn-primary');
await page.waitForSelector('#pmCamp');
await page.click('#pmCamp');
await page.waitForSelector('#czName');
await page.click('.modal-f .btn-primary');            /* Vérifier la campagne */
await page.waitForSelector('#czAutoOpt', { timeout: 10000 });
await page.click('#czAutoOpt');
await page.waitForSelector('#czAutoOpt.on');
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/80-controle-confie.png' });
await page.click('.modal-f .btn-primary');            /* Valider */
await page.waitForSelector('#rqPad .pad-k');
await tapIn('#rqPad', '280941');
await page.waitForSelector('.toast.on', { timeout: 15000 });
const t1 = await page.textContent('.toast.on');
if (!/Confiée à ton ordinateur/.test(t1)) fail('toast : ' + t1);
console.log('campagne confiée par l’assistant ✓');

/* le Compagnon envoie — pour de vrai, jusqu'au puits SMTP */
await attendre(() => messages.length >= 2, 30000, '2 envois SMTP du Compagnon');
if (messages.length !== 2) fail('2 envois attendus, vu ' + messages.length);
const corps = messages.map(m => m.data).join('\n');
if (!/nadia@exemple\.fr/.test(messages.map(m => m.to.join()).join())) fail('destinataire absent');
if (!/arr=C3=AAte l=C3=A0|arrête là/.test(corps)) fail('mention d’opposition absente du courrier');
console.log('2 envois SMTP réels reçus par le puits ✓');

/* KILL brutal + relance : le journal scellé interdit le doublon */
arreter();
await new Promise(r => setTimeout(r, 800));
lancer();
await attendre(async () => !!(await sonde()), 30000, 'Compagnon relancé');
await new Promise(r => setTimeout(r, 4000));          /* plusieurs ticks */
if (messages.length !== 2) fail('DOUBLON après kill/relance : ' + messages.length + ' messages');
console.log('kill −9 puis relance : toujours 2 messages — zéro doublon ✓');

/* la PWA replie le rapport au retour */
await page.reload({ waitUntil: 'load' });
await deverrouiller();
/* le retrait du verrou précède de quelques millisecondes la fin de
   l'amorçage : attendre le marqueur posé après loadCampaigns évite de
   lancer la réconciliation alors que son état mémoire est encore vide */
await page.waitForFunction(() => !!document.querySelector('#sbVer')?.textContent.trim(),
  null, { timeout: 10000 });
await page.evaluate(async () => {
  await (await import('./ui/campagnes.js')).reconcileCompanion();
});
await attendrePage(page, async () => {
  const st = await import('./engine/storage.js');
  const cs = JSON.parse(await st.kvGet(st.CAMPAIGNS_KEY) || '[]');
  return cs.length === 1 && (cs[0].log || []).length === 2;
}, { timeout: 20000 });
await page.goto(base + '/#/aujourdhui');
await page.waitForSelector('.camp-line');
await page.waitForFunction(() => /2 envoyés/.test(
  document.querySelector('.camp-line')?.textContent || ''), null, { timeout: 20000 });
const ligne = await page.textContent('.camp-line');
if (!/ton ordinateur s’en occupe/.test(ligne) || !/2 envoyés/.test(ligne)) fail('ligne du jour : ' + ligne);
console.log('rapport replié : 2 envois au journal de la PWA ✓');

/* la feuille du jour en mode confié + reprise en main */
await page.click('.camp-line');
await page.waitForSelector('#czReprendre');
await page.waitForFunction(() => /prêt/.test(document.querySelector('#czCompLive')?.textContent || ''), null, { timeout: 8000 });
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/81-feuille-confiee.png' });
await page.click('#czReprendre');
await page.waitForSelector('.modal-f button:has-text("Reprendre")');
await page.click('.modal-f button:has-text("Reprendre")');
await page.waitForSelector('#rqPad .pad-k');
await tapIn('#rqPad', '280941');
await attendrePage(page, async () => {
  const { loadCampaigns } = await import('./ui/campagnes.js');
  const cs = await loadCampaigns();
  return cs[0] && !cs[0].auto;
}, { timeout: 10000 });
console.log('reprise en main : la campagne redevient manuelle ✓');

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
arreter();
await browser.close();
server.close();
sink.close();
console.log(process.exitCode ? 'E2E compagnon-envoi : ÉCHEC' : 'E2E compagnon-envoi : OK');
