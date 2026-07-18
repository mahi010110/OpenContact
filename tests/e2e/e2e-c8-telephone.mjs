/* E2E C8 : une campagne est préparée sur un téléphone qui connaît le
   Compagnon dans l'anneau, mais n'a aucune association locale. Son bon
   signé emprunte le rail privé de « Mes appareils » ; l'ordinateur le
   remet au VRAI Compagnon, qui accepte la clé du téléphone dans l'anneau
   et envoie une seule fois, même après plusieurs rejeux de sync. */
import { chromium, chromiumPath, SHOTS, serveRepo, ROOT } from './outils.mjs';
import { spawn } from 'child_process';
import { existsSync, mkdtempSync } from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

const BIN = path.join(ROOT, 'compagnon', 'target', 'debug', 'oc-compagnon');
if (!existsSync(BIN)) {
  console.log('binaire absent (cargo build -p oc-compagnon) — scénario sauté');
  process.exit(0);
}

const messages = [];
const sink = net.createServer(sock => {
  let buf = '', inData = false;
  sock.write('220 puits C8\r\n');
  sock.on('data', d => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (inData) {
        if (line === '.') { inData = false; messages.push(Date.now()); sock.write('250 ok\r\n'); }
        continue;
      }
      const u = line.toUpperCase();
      if (u.startsWith('EHLO') || u.startsWith('HELO')) sock.write('250-puits\r\n250 OK\r\n');
      else if (u === 'DATA') { inData = true; sock.write('354 go\r\n'); }
      else if (u === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 ok\r\n');
    }
  });
});
await new Promise(r => sink.listen(2528, '127.0.0.1', r));

const xdg = mkdtempSync(path.join(os.tmpdir(), 'oc-c8-'));
const CODE = 'ABCD-2345';
const compagnon = spawn('xvfb-run', ['-a', 'dbus-run-session', '--', BIN], {
  env: Object.assign({}, process.env, {
    XDG_DATA_HOME: xdg,
    OC_APPAIRAGE_AUTO: CODE,
    OC_SMTP_TEST: '127.0.0.1:2528',
    OC_TICK_MS: '500',
    OC_FENETRE_TEST: '1',
    OC_INTEGRATION_TEST: '1'
  }),
  stdio: ['ignore', 'pipe', 'pipe'], detached: true
});
compagnon.stderr.on('data', () => {});
const arreter = () => { try { process.kill(-compagnon.pid, 'SIGKILL'); } catch (e) {} };
const attendre = async (fn, ms, quoi) => {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - t0 > ms) throw new Error('attente : ' + quoi);
    await new Promise(r => setTimeout(r, 250));
  }
};
const sonde = async () => {
  for (const port of [17095, 17096, 17097]) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/oc-compagnon`, { signal: AbortSignal.timeout(700) });
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  return null;
};
await attendre(async () => (await sonde())?.appairage, 30000, 'Compagnon C8');

const { server: desktopServer, base: desktopBase } = await serveRepo();
const { server: phoneServer, base: phoneBase } = await serveRepo();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const desktop = await desktopCtx.newPage();
const phone = await phoneCtx.newPage();
const errors = [];
for (const [name, page] of [['ordinateur', desktop], ['téléphone', phone]]) {
  page.on('console', m => { if (m.type() === 'error') errors.push(name + ' : ' + m.text()); });
  page.on('pageerror', e => errors.push(name + ' : ' + String(e)));
}
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };
const tapIn = async (page, scope, code) => {
  for (const d of code) await page.click(`${scope} .pad-k[data-d="${d}"]`);
};
const unlock = async page => {
  await page.waitForSelector('.lock .pad-k');
  await tapIn(page, '.lock', '280941');
  await page.waitForFunction(() => !document.querySelector('.lock'), null, { timeout: 10000 });
  /* Le verrou disparaît juste avant la fin de l'amorçage. Charger ici
     rend le scénario déterministe sur les machines lentes. */
  await page.evaluate(async () => {
    await (await import('./ui/state.js')).loadAll();
    await (await import('./ui/campagnes.js')).loadCampaigns();
  });
};
const piste = { id: 'p-c8', name: 'Atelier C8', city: 'Lille', status: 'todo',
  contacts: [{ id: 'k-c8', name: 'Nora', email: 'nora@exemple.fr' }], updatedAt: 1 };

/* L'ordinateur principal crée l'anneau et y inscrit d'abord le téléphone. */
await desktop.goto(desktopBase, { waitUntil: 'load' });
await desktop.evaluate(async p => {
  const st = await import('./engine/storage.js');
  await st.kvInit();
  await st.kvSet(st.DATA_KEY, JSON.stringify([p]));
  const { createVault, makeVaultPhrase } = await import('./engine/vault.js');
  const phrase = makeVaultPhrase();
  const made = await createVault('280941', phrase, { iter: 15000 });
  st.vaultAttach(made.key);
  await st.vaultSealAll();
  st.vaultDetach();
  await st.kvSet(st.VAULT_KEY, JSON.stringify(made.meta));
  localStorage.setItem('t_phrase', phrase);
}, piste);
await desktop.reload({ waitUntil: 'load' });
await unlock(desktop);
const phoneKeys = await desktop.evaluate(async () => {
  const st = await import('./engine/storage.js');
  const { ensureRing } = await import('./ui/synclive.js');
  const { makeDeviceKeys, ringAddDevice } = await import('./engine/ring.js');
  await ensureRing(localStorage.getItem('t_phrase'));
  const keys = await makeDeviceKeys();
  const rs = JSON.parse(await st.kvGet(st.RING_KEY));
  rs.ring = await ringAddDevice(rs.ring, rs.keys.seed,
    { id: 'telephone-c8', name: 'Téléphone C8', pub: keys.pub });
  await st.kvSet(st.RING_KEY, JSON.stringify(rs));
  return keys;
});
await desktop.reload({ waitUntil: 'load' });
await unlock(desktop);

/* Appairage réel. L'anneau transmis au Compagnon contient déjà le téléphone. */
const finalRing = await desktop.evaluate(async code => {
  const { probeCompanion, pairCompanion } = await import('./engine/companion.js');
  const st = await import('./engine/storage.js');
  const { deviceSelf, ensureKeys, getRing, ringAddCompanion } = await import('./ui/synclive.js');
  const found = await probeCompanion();
  const self = await deviceSelf();
  const keys = await ensureKeys();
  const rep = await pairCompanion(found.base, code, found.info.appairage.s,
    { id: self.id, name: self.name, pub: keys.pub }, getRing());
  await st.kvSet(st.COMPANION_KEY, JSON.stringify({
    k: rep.k, id: rep.compagnon.id, nom: rep.compagnon.name, pub: rep.compagnon.pub, at: Date.now()
  }));
  await ringAddCompanion({ id: rep.compagnon.id, name: rep.compagnon.name, pub: rep.compagnon.pub });
  const maj = await (await import('./engine/companion.js')).companionCall(found.base, rep.k,
    { t: 'anneau', ring: getRing() });
  if (!maj || maj.t !== 'ok') throw new Error('anneau-compagnon');
  return getRing();
}, CODE);

/* Le téléphone reçoit l'anneau par « Mes appareils », sans recevoir la
   clé de canal locale du Compagnon. */
await phone.goto(phoneBase, { waitUntil: 'load' });
await phone.evaluate(async ({ p, keys, ring }) => {
  const st = await import('./engine/storage.js');
  await st.kvInit();
  await st.kvSet(st.DATA_KEY, JSON.stringify([p]));
  await st.kvSet(st.DEVICE_KEY, JSON.stringify({ id: 'telephone-c8', name: 'Téléphone C8' }));
  await st.kvSet(st.RING_KEY, JSON.stringify({ keys, ring, applied: [] }));
  const { createVault, makeVaultPhrase } = await import('./engine/vault.js');
  const phrase = makeVaultPhrase();
  const made = await createVault('280941', phrase, { iter: 15000 });
  st.vaultAttach(made.key);
  await st.vaultSealAll();
  st.vaultDetach();
  await st.kvSet(st.VAULT_KEY, JSON.stringify(made.meta));
}, { p: piste, keys: phoneKeys, ring: finalRing });
await phone.reload({ waitUntil: 'load' });
await unlock(phone);
await phone.evaluate(async () => {
  const { S } = await import('./ui/state.js');
  (await import('./ui/campagnes.js')).openCampaignWizard([S.companies[0]]);
});
await phone.waitForSelector('#czName');
await phone.click('.modal-f .btn-primary');
await phone.waitForSelector('#czAutoOpt');
const autoTxt = await phone.textContent('#czAutoOpt');
if (!/dès qu’il te rejoint/.test(autoTxt)) fail('état téléphone ambigu : ' + autoTxt);
const autoBox = await phone.locator('#czAutoOpt').boundingBox();
if (!autoBox || autoBox.height < 44) fail('cible tactile auto trop petite');
await phone.click('#czAutoOpt');
await phone.screenshot({ path: SHOTS + '/c8-telephone-clair.png' });
await phone.evaluate(() => document.querySelector('#btnTheme')?.click());
await phone.screenshot({ path: SHOTS + '/c8-telephone-sombre.png' });
await phone.click('.modal-f .btn-primary');
await phone.waitForSelector('#rqPad .pad-k');
await tapIn(phone, '#rqPad', '280941');
await phone.waitForFunction(() => /dès qu’il te rejoint/.test(document.querySelector('.toast.on')?.textContent || ''),
  null, { timeout: 15000 });
const payload = await phone.evaluate(async () => {
  const st = await import('./engine/storage.js');
  return {
    campaigns: JSON.parse(await st.kvGet(st.CAMPAIGNS_KEY) || '[]'),
    missions: JSON.parse(await st.kvGet(st.MISSIONS_KEY) || '[]'),
    assoc: await st.kvGet(st.COMPANION_KEY)
  };
});
if (payload.assoc) fail('le téléphone ne doit pas posséder la clé locale du Compagnon');
if (payload.campaigns.length !== 1 || payload.missions.length !== 1) fail('campagne/mission téléphone absente');
if (payload.missions[0].wire.dev !== 'telephone-c8') fail('bon non signé par le téléphone');
const wireExact = JSON.stringify(payload.missions[0].wire);
console.log('téléphone : auto proposé, bon signé prêt, aucune clé locale ✓');

/* Le rail privé existant converge sur l'ordinateur, qui est le seul à
   parler au canal local du Compagnon. */
await desktop.evaluate(async p => {
  const sync = await import('./ui/synclive.js');
  const campagnes = await import('./ui/campagnes.js');
  await sync.applyPrivatePayload(p);
  await campagnes.loadCampaigns();
  await campagnes.reconcileCompanion();
}, { campaigns: payload.campaigns, missions: payload.missions });
await attendre(() => messages.length >= 1, 30000, 'premier envoi C8');

/* Rejouer le même instantané et demander plusieurs réconciliations ne
   doit ni altérer le fil ni redonner le même envoi. */
await desktop.evaluate(async p => {
  const sync = await import('./ui/synclive.js');
  const campagnes = await import('./ui/campagnes.js');
  await Promise.all([sync.applyPrivatePayload(p), sync.applyPrivatePayload(p), sync.applyPrivatePayload(p)]);
  await Promise.all([campagnes.reconcileCompanion(), campagnes.reconcileCompanion(), campagnes.reconcileCompanion()]);
}, { campaigns: payload.campaigns, missions: payload.missions });
await new Promise(r => setTimeout(r, 2500));
if (messages.length !== 1) fail('double envoi C8 : ' + messages.length);
const desktopState = await desktop.evaluate(async () => {
  const st = await import('./engine/storage.js');
  return {
    campaigns: JSON.parse(await st.kvGet(st.CAMPAIGNS_KEY) || '[]'),
    missions: JSON.parse(await st.kvGet(st.MISSIONS_KEY) || '[]')
  };
});
if (desktopState.campaigns.length !== 1 || desktopState.missions.length !== 1)
  fail('duplication dans le stockage ordinateur');
if (desktopState.missions[0].state !== 'confiee') fail('mission non confiée');
if (JSON.stringify(desktopState.missions[0].wire) !== wireExact) fail('fil signé altéré par la sync');
await desktop.evaluate(() => { location.hash = '#/aujourdhui'; });
await desktop.waitForFunction(() => {
  const view = document.querySelector('#view-aujourdhui');
  return !!document.querySelector('#sbVer')?.textContent.trim() && view && !view.hidden && !!view.querySelector('.camp-line');
}, null, { timeout: 10000 });
await desktop.waitForTimeout(350);                    /* fin de l'animation d'entrée */
await desktop.screenshot({ path: SHOTS + '/c8-ordinateur-clair.png' });
await desktop.evaluate(() => document.querySelector('#btnTheme')?.click());
await desktop.screenshot({ path: SHOTS + '/c8-ordinateur-sombre.png' });
console.log('ordinateur : mission confiée une fois, 1 envoi après trois rejeux ✓');

if (errors.length) { errors.forEach(e => console.error(e)); process.exitCode = 1; }
console.log(errors.length ? 'Erreurs console détectées.' : 'Zéro erreur console.');
arreter();
await browser.close();
desktopServer.close();
phoneServer.close();
sink.close();
console.log(process.exitCode ? 'E2E C8 téléphone : ÉCHEC' : 'E2E C8 téléphone : OK');
