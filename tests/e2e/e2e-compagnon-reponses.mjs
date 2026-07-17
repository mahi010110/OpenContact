/* E2E C5 : la détection des réponses par le VRAI Compagnon (IMAP).
   Faux IMAP local (OC_IMAP_TEST) : après les envois, « nadia »
   répond → le Compagnon arrête ses relances tout seul et la PWA
   marque la fiche « réponse » au repli du rapport.
   Sauté proprement si le binaire n'est pas construit. */
import { chromium, chromiumPath, SHOTS, serveRepo, ROOT } from './outils.mjs';
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

/* ---------- puits SMTP + faux IMAP ---------- */
const messages = [];
const sink = net.createServer(sock => {
  let buf = '', inData = false;
  sock.write('220 puits\r\n');
  sock.on('data', d => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0){
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (inData){
        if (line === '.'){ inData = false; messages.push(1); sock.write('250 ok\r\n'); }
        continue;
      }
      const u = line.toUpperCase();
      if (u.startsWith('EHLO') || u.startsWith('HELO')) sock.write('250-p\r\n250 OK\r\n');
      else if (u === 'DATA'){ inData = true; sock.write('354 go\r\n'); }
      else if (u === 'QUIT'){ sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 ok\r\n');
    }
  });
});
await new Promise(r => sink.listen(2525, '127.0.0.1', r));

const repondeurs = new Set();          /* qui a « répondu » dans la boîte */
const imapFaux = net.createServer(sock => {
  let buf = '';
  sock.write('* OK faux imap\r\n');
  sock.on('data', d => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0){
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const tag = line.split(' ')[0];
      const u = line.toUpperCase();
      if (u.includes('CAPABILITY')) sock.write(`* CAPABILITY IMAP4rev1\r\n${tag} OK\r\n`);
      else if (u.includes('LOGIN')) sock.write(`${tag} OK connecté\r\n`);
      else if (u.includes('SELECT')) sock.write(`* 3 EXISTS\r\n* OK [UIDVALIDITY 1] ok\r\n${tag} OK [READ-WRITE] SELECT\r\n`);
      else if (u.includes('SEARCH')){
        const trouve = [...repondeurs].some(e => line.includes(e));
        sock.write(`* SEARCH${trouve ? ' 42' : ''}\r\n${tag} OK SEARCH\r\n`);
      }
      else if (u.includes('LOGOUT')) { sock.write(`* BYE\r\n${tag} OK\r\n`); sock.end(); }
      else sock.write(`${tag} OK\r\n`);
    }
  });
});
await new Promise(r => imapFaux.listen(1143, '127.0.0.1', r));

/* ---------- le vrai Compagnon ---------- */
const xdg = mkdtempSync(path.join(os.tmpdir(), 'oc-compagnon-rep-'));
const CODE = 'ABCD-2345';
const compagnon = spawn('xvfb-run', ['-a', 'dbus-run-session', '--', BIN], {
  env: Object.assign({}, process.env, {
    XDG_DATA_HOME: xdg,
    OC_APPAIRAGE_AUTO: CODE,
    OC_SMTP_TEST: '127.0.0.1:2525',
    OC_IMAP_TEST: '127.0.0.1:1143',
    OC_TICK_MS: '1200',
    OC_FENETRE_TEST: '1'
  }),
  stdio: ['ignore', 'pipe', 'pipe'], detached: true
});
let journalC = '';
compagnon.stdout.on('data', d => { journalC += d; });
const arreter = () => { try { process.kill(-compagnon.pid, 'SIGKILL'); } catch (e) {} };
const attendre = async (fn, ms, quoi) => {
  const t0 = Date.now();
  for (;;){
    if (await fn()) return;
    if (Date.now() - t0 > ms) throw new Error('attente : ' + quoi);
    await new Promise(r => setTimeout(r, 400));
  }
};
await attendre(async () => {
  try {
    const r = await fetch('http://127.0.0.1:17095/oc-compagnon', { signal: AbortSignal.timeout(800) });
    const j = r.ok && await r.json();
    return j && j.appairage;
  } catch (e) { return false; }
}, 30000, 'canal du Compagnon');

/* ---------- la PWA : coffre, anneau, appairage, campagne confiée ---------- */
const { server, base } = await serveRepo();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };
const tapIn = async (scope, code) => { for (const d of code) await page.click(`${scope} .pad-k[data-d="${d}"]`); };

await page.goto(base, { waitUntil: 'load' });
await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  await st.kvInit();
  await st.kvSet(st.DATA_KEY, JSON.stringify([
    { id: 'p1', name: 'Orange Cyberdefense', city: 'Lille', status: 'todo',
      contacts: [{ id: 'k1', name: 'Nadia', email: 'nadia@exemple.fr' }], updatedAt: 1 },
    { id: 'p2', name: 'OVHcloud', city: 'Roubaix', status: 'todo',
      contacts: [{ id: 'k2', name: 'Théo', email: 'theo@exemple.fr' }], updatedAt: 1 }
  ]));
  const { createVault, makeVaultPhrase } = await import('./engine/vault.js');
  const made = await createVault('280941', makeVaultPhrase(), { iter: 15000 });
  await st.kvSet(st.VAULT_KEY, JSON.stringify(made.meta));
  localStorage.setItem('t_phrase', makeVaultPhrase());
});
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.lock .pad-k');
await tapIn('.lock', '280941');
await page.waitForFunction(() => !document.querySelector('.lock'), null, { timeout: 10000 });
await page.evaluate(async () => (await import('./ui/synclive.js')).ensureRing(localStorage.getItem('t_phrase')));
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
  /* campagne confiée, posée directement (l'assistant est couvert ailleurs) */
  const { buildCampaign } = await import('./engine/campaign.js');
  const { makeMission, signMission } = await import('./engine/mission.js');
  const { todayISO } = await import('./engine/utils.js');
  const steps = [{ subject: 'Candidature', body: 'Bonjour {{contact}}.' },
    { subject: 'Re', body: 'R1' }, { subject: 'Re', body: 'R2' }];
  const c = buildCampaign({ name: 'Confiée', steps, launchAt: todayISO(),
    targets: [
      { cid: 'p1', name: 'Nadia', email: 'nadia@exemple.fr', company: 'Orange Cyberdefense' },
      { cid: 'p2', name: 'Théo', email: 'theo@exemple.fr', company: 'OVHcloud' }
    ] });
  c.auto = true;
  await st.kvSet(st.CAMPAIGNS_KEY, JSON.stringify([c]));
  const m = makeMission('campaign-run', { campaign: { id: c.id, state: 'ready',
    targets: c.targets.map(t => ({ tid: t.tid, cid: t.cid, email: t.email, who: t.who,
      startAt: t.startAt, state: t.state, msgs: t.msgs })) } });
  const wire = await signMission(m, self.id, keys.seed);
  await st.kvSet(st.MISSIONS_KEY, JSON.stringify([{ mid: m.mid, cpId: c.id, wire, state: 'a_confier', stops: [] }]));
  const { loadCampaigns } = await import('./ui/campagnes.js');
  await loadCampaigns();   /* la réconciliation remet le bon */
}, CODE);

/* les 2 premiers messages partent */
await attendre(() => messages.length >= 2, 30000, '2 envois SMTP');
console.log('2 envois partis ✓ — maintenant « nadia » répond dans la boîte');
repondeurs.add('nadia@exemple.fr');

/* le Compagnon détecte la réponse et arrête la cible, seul */
await attendre(() => /réponse détectée/.test(journalC), 30000, 'détection IMAP');
console.log('réponse détectée par le Compagnon ✓');

/* la PWA replie : cible replied, fiche « réponse », trace */
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.lock .pad-k');
await tapIn('.lock', '280941');
await page.waitForFunction(() => !document.querySelector('.lock'), null, { timeout: 10000 });
await page.waitForFunction(async () => {
  const { loadCampaigns } = await import('./ui/campagnes.js');
  const cs = await loadCampaigns();
  const t = cs[0] && cs[0].targets.find(x => x.cid === 'p1');
  return t && t.state === 'replied';
}, null, { timeout: 20000 });
await page.waitForFunction(async () => {
  const st = await import('./engine/storage.js');
  const data = JSON.parse(await st.kvGet(st.DATA_KEY));
  const p = data.find(x => x.id === 'p1');
  return p && p.status === 'reply';
}, null, { timeout: 10000 }).catch(() => {});
const fiche = await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  const data = JSON.parse(await st.kvGet(st.DATA_KEY));
  const p = data.find(x => x.id === 'p1');
  return { status: p.status, hist: (p.history || []).map(h => h.t).join(' | ') };
});
if (fiche.status !== 'reply') fail('statut fiche attendu reply, vu ' + fiche.status);
if (!/réponse détectée par ton ordinateur/.test(fiche.hist)) fail('trace absente : ' + fiche.hist);
console.log('fiche marquée « réponse », trace posée ✓');
await page.goto(base + '/#/aujourdhui');
await page.waitForSelector('.camp-line');
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/85-reponse-detectee.png' });

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
arreter();
await browser.close();
server.close();
sink.close();
imapFaux.close();
console.log(process.exitCode ? 'E2E compagnon-réponses : ÉCHEC' : 'E2E compagnon-réponses : OK');
