/* E2E P8-2 : le serveur MCP local du VRAI Compagnon, au protocole réel.
   Un client JSON-RPC (stdio) lance `oc-compagnon --mcp` comme le ferait
   un client IA compatible : initialisation, découverte des outils
   (aucune suppression ni écriture directe), lecture bornée sans champ
   privé, dépôt d'une proposition normale puis hostile, rejeu idempotent.
   Côté PWA : autorisation depuis la feuille du Compagnon, proposition
   retrouvée après rechargement + verrouillage + redémarrage (kill -9)
   du Compagnon, aperçu multi-sélection (décocher, fusionner, Annuler,
   écarter), aucune écriture avant validation, révocation immédiate.
   Vérifié à 1280×800 (clair) et 390×844 (sombre, cibles ≥ 44 px).
   Sauté proprement si le binaire n'est pas construit. */
import { chromium, chromiumPath, SHOTS, serveRepo, ROOT } from './outils.mjs';
import { spawn } from 'child_process';
import { existsSync, mkdtempSync } from 'fs';
import os from 'os';
import path from 'path';

const BIN = path.join(ROOT, 'compagnon', 'target', 'debug', 'oc-compagnon');
if (!existsSync(BIN)){
  console.log('binaire absent (cargo build -p oc-compagnon) — scénario sauté');
  process.exit(0);
}

const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };
const ok = (v, m) => { if (!v) fail(m); };

/* ---------- le vrai Compagnon (coquille + canal) ---------- */
const xdg = mkdtempSync(path.join(os.tmpdir(), 'oc-mcp-'));
const CODE = 'ABCD-2345';
const envCompagnon = Object.assign({}, process.env, {
  XDG_DATA_HOME: xdg,
  OC_APPAIRAGE_AUTO: CODE,
  OC_INTEGRATION_TEST: '1'
});
let compagnon = null;
function lancerCompagnon(){
  compagnon = spawn('xvfb-run', ['-a', 'dbus-run-session', '--', BIN],
    { env: envCompagnon, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  compagnon.stdout.resume();
  compagnon.stderr.resume();
}
const tuerCompagnon = () => { try { process.kill(-compagnon.pid, 'SIGKILL'); } catch (e) {} };
const attendre = async (fn, ms, quoi) => {
  const t0 = Date.now();
  for (;;){
    if (await fn()) return;
    if (Date.now() - t0 > ms) throw new Error('attente : ' + quoi);
    await new Promise(r => setTimeout(r, 400));
  }
};
const canalPret = () => attendre(async () => {
  for (const port of [17095, 17096, 17097]){
    try {
      const r = await fetch(`http://127.0.0.1:${port}/oc-compagnon`, { signal: AbortSignal.timeout(800) });
      if (r.ok && (await r.json()).v === 1) return true;
    } catch (e) {}
  }
  return false;
}, 30000, 'canal du Compagnon');

/* ---------- un client MCP au protocole réel (JSON-RPC sur stdio) ---------- */
class ClientMcp {
  constructor(){
    this.proc = spawn(BIN, ['--mcp'], { env: envCompagnon, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stderr.resume();
    this.buf = '';
    this.pend = new Map();
    this.id = 0;
    this.fin = new Promise(r => this.proc.on('close', r));
    this.proc.stdout.on('data', d => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0){
        const ligne = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!ligne) continue;
        let m = null;
        try { m = JSON.parse(ligne); } catch (e) { continue; }
        if (m.id != null && this.pend.has(m.id)){ this.pend.get(m.id)(m); this.pend.delete(m.id); }
      }
    });
  }
  brut(obj){ this.proc.stdin.write(JSON.stringify(obj) + '\n'); }
  req(method, params){
    const id = ++this.id;
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('mcp sans réponse : ' + method)), 20000);
      this.pend.set(id, m => { clearTimeout(t); res(m); });
      this.brut({ jsonrpc: '2.0', id, method, params });
    });
  }
  async init(){
    const r = await this.req('initialize', { protocolVersion: '2025-06-18',
      capabilities: {}, clientInfo: { name: 'test-opencontact', version: '1.0' } });
    this.brut({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return r;
  }
  outil(name, args){ return this.req('tools/call', { name, arguments: args }); }
  async fermer(){ try { this.proc.stdin.end(); } catch (e) {} return this.fin; }
}

/* ---------- la PWA ---------- */
const { server, base } = await serveRepo();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('console', m => {
  if (m.type() !== 'error') return;
  /* le scénario ÉTEINT le Compagnon exprès : la sonde du canal local qui
     échoue alors est le chemin hors-ligne normal, rattrapé par l'app —
     tout autre message reste une erreur */
  if (/ERR_CONNECTION_REFUSED/.test(m.text()) && /127\.0\.0\.1:1709\d/.test(m.location()?.url || '')) return;
  errors.push(m.text());
});
page.on('pageerror', e => errors.push(String(e)));
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
  /* deux pistes à moi, avec du PRIVÉ qui ne doit jamais sortir */
  await st.kvSet(st.DATA_KEY, JSON.stringify([
    { id: 'alpha1', name: 'Alpha Cyber', city: 'Lille', domain: 'cyber',
      positions: ['stage'], status: 'active', notes: 'NOTE PRIVÉE ALPHA',
      nextActionText: 'Relancer le RH', history: [{ d: '2026-07-01', t: 'Email envoyé' }],
      contacts: [{ id: 'ct1', name: 'Iris Confidentielle', email: 'privee@exemple.fr' }],
      createdAt: 1752000000000, updatedAt: 1752600000000 },
    { id: 'beta1', name: 'Beta Cloud', city: 'Roubaix', domain: 'cloud',
      status: 'todo', createdAt: 1752000000000, updatedAt: 1752500000000 }
  ]));
  const { createVault, makeVaultPhrase } = await import('./engine/vault.js');
  const made = await createVault('280941', makeVaultPhrase(), { iter: 15000 });
  await st.kvSet(st.VAULT_KEY, JSON.stringify(made.meta));
  localStorage.setItem('t_phrase', makeVaultPhrase());
});
await page.reload({ waitUntil: 'load' });
await deverrouiller();
await page.evaluate(async () => (await import('./ui/synclive.js')).ensureRing(localStorage.getItem('t_phrase')));
/* le Compagnon part seulement maintenant : son code d'appairage (2 min)
   n'a pas à survivre au démarrage du navigateur */
lancerCompagnon();
await canalPret();
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
console.log('appairé ✓');

/* l'autorisation, par la vraie feuille : Ton assistant IA → Autoriser → code */
const openCompanionSheet = () => page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  const assoc = JSON.parse(await st.kvGet(st.COMPANION_KEY));
  (await import('./ui/compagnon.js')).openCompanionSheet(assoc);
});
await openCompanionSheet();
await page.waitForSelector('#cgMcp');
await attendre(() => page.evaluate(() =>
  document.querySelector('#cgMcpSt')?.textContent.includes('coupé')), 10000, 'état assistant coupé');
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/95-mcp-feuille-compagnon.png' });
await page.click('#cgMcp');
await page.waitForSelector('.modal-f .btn-primary:has-text("Autoriser")');
await page.click('.modal-f .btn-primary:has-text("Autoriser")');
await page.waitForSelector('#rqPad .pad-k');
await tapIn('#rqPad', '280941');
await attendre(() => page.evaluate(() =>
  document.querySelector('#cgMcpSt')?.textContent.includes('autorisé')), 10000, 'assistant autorisé');
/* l'autorisation est un souvenir durable — attendue avant de sonder */
await attendre(() => page.evaluate(async () => {
  const m = await import('./ui/propositions.js');
  const r = await m.loadProposals();
  return !!(r && r.actif);
}), 10000, 'autorisation mémorisée');
await page.keyboard.press('Escape');   /* referme la feuille du Compagnon */
await page.waitForFunction(() => !document.querySelector('.overlay'));
/* le résumé part vers le Compagnon */
await page.evaluate(async () => (await import('./ui/propositions.js')).reconcileProposals());
console.log('assistant autorisé depuis la PWA ✓');

/* ---------- 1-5 : initialisation, découverte, lecture bornée ---------- */
const c1 = new ClientMcp();
const init = await c1.init();
ok(init.result && init.result.protocolVersion, 'initialisation MCP');
ok(/aperçu/.test(init.result.instructions || ''), 'instructions du serveur');
const liste = await c1.req('tools/list');
const outils = (liste.result.tools || []).map(t => t.name).sort();
ok(JSON.stringify(outils) === JSON.stringify(['proposer_pistes', 'resume_pistes']),
  'exactement deux outils, vu : ' + outils.join(', '));
for (const t of liste.result.tools){
  ok(!/suppr|delete|remove|efface|wipe|write|merge|fusion|envoi|send|mail|exec|command|fichier|file/i.test(t.name),
    'nom d’outil dangereux : ' + t.name);
  ok(t.inputSchema && t.inputSchema.additionalProperties === false,
    'schéma non fermé pour ' + t.name);
}
const lu = await c1.outil('resume_pistes', {});
ok(!lu.result.isError, 'lecture du résumé');
const resume = lu.result.structuredContent;
ok(resume.pistes.length === 2 && resume.total === 2, 'résumé : 2 pistes attendues');
ok(resume.pistes[0].nom === 'Alpha Cyber' && resume.pistes[1].nom === 'Beta Cloud',
  'tri déterministe du résumé');
ok(JSON.stringify(resume.suivi) === JSON.stringify({ a_contacter: 1, en_cours: 1 , reponse: 0 })
  || (resume.suivi.a_contacter === 1 && resume.suivi.en_cours === 1 && resume.suivi.reponse === 0),
  'suivi agrégé : ' + JSON.stringify(resume.suivi));
const brut = JSON.stringify(lu.result);
for (const interdit of ['NOTE PRIVÉE', 'Relancer', 'privee@exemple.fr', 'Iris',
  'Confidentielle', 'history', 'status', 'notes', 'OCV1', 't_phrase', '280941'])
  ok(!brut.includes(interdit), 'fuite dans la lecture : ' + interdit);
for (const p of resume.pistes)
  for (const k of Object.keys(p))
    ok(['nom', 'ville', 'domaine', 'postes', 'maj'].includes(k), 'champ hors liste blanche : ' + k);
const lu1 = await c1.outil('resume_pistes', { limite: 1 });
ok(lu1.result.structuredContent.pistes.length === 1 &&
   lu1.result.structuredContent.montrees === 1, 'limite de lecture appliquée');
console.log('découverte + lecture bornée, sans un champ privé ✓');

/* ---------- 6-8 : proposition normale, hostile, rejeu ---------- */
const P1 = { pistes: [
  { name: 'Sopra Steria', city: 'Lille', domain: 'hacker', positions: ['stage', 'pdg'],
    contacts: [{ name: 'Iris', email: 'iris@soprasteria.com', link: 'javascript:alert(1)' }] },
  { name: 'Exotec', city: 'Croix' }
] };
const d1 = await c1.outil('proposer_pistes', P1);
ok(!d1.result.isError, 'dépôt de la proposition');
const pid1 = d1.result.structuredContent.pid;
ok(/^[0-9a-f]{16}$/.test(pid1), 'pid attendu, vu : ' + pid1);
const d1bis = await c1.outil('proposer_pistes', P1);
ok(d1bis.result.structuredContent && d1bis.result.structuredContent.etat === 'deja_en_attente'
   && d1bis.result.structuredContent.pid === pid1, 'rejeu en attente = même pid, rien de plus');
for (const [hostile, quoi] of [
  [{ pistes: [] }, 'proposition vide'],
  [{ pistes: [{ name: 'X', status: 'reply' }] }, 'statut privé imposé'],
  [{ pistes: [{ name: 'X', notes: 'privé' }] }, 'note privée imposée'],
  [{ pistes: [{ name: 'X', id: '"><img onerror=1>' }] }, 'identifiant imposé'],
  [{ pistes: [{ name: 'X', __proto__x: 1, ['__proto__']: { pollue: 1 } }] }, 'clé prototype'],
  [{ pistes: [{ name: 'x'.repeat(200) }] }, 'nom débordant'],
  [{ pistes: [{ name: 'X', contacts: [{ name: 'A', conf: 'ok' }] }] }, 'confiance imposée'],
  [{ pistes: Array.from({ length: 31 }, (_, i) => ({ name: 'p' + i })) }, 'trop de pistes'],
  [{ pistes: [{ name: 'X' }], autre: true }, 'champ racine inconnu']
]){
  const r = await c1.outil('proposer_pistes', hostile);
  ok(r.result && r.result.isError, 'aurait dû être refusé : ' + quoi);
}
/* les pistes de la PWA n'ont pas bougé d'un octet */
const avant = await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  return JSON.parse(await st.kvGet(st.DATA_KEY)).map(c => c.name).sort().join(',');
});
ok(avant === 'Alpha Cyber,Beta Cloud', 'écriture directe détectée : ' + avant);
await c1.fermer();
console.log('proposition déposée, hostiles refusées, aucune écriture directe ✓');

/* ---------- 9 : la proposition survit au redémarrage du Compagnon ---------- */
tuerCompagnon();
await new Promise(r => setTimeout(r, 800));
lancerCompagnon();
await canalPret();

/* ---------- 10-11 : la PWA la rapporte, la garde scellée, la retrouve ---------- */
await page.evaluate(async () => (await import('./ui/propositions.js')).reconcileProposals());
await page.waitForSelector('#tdProps', { timeout: 15000 });
ok(/2 pistes/.test(await page.textContent('#tdProps')), 'chip d’Aujourd’hui');
const scelle = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const rq = indexedDB.open('oc_kv_v1', 1);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  const raw = await new Promise((res, rej) => {
    const rq = db.transaction('kv', 'readonly').objectStore('kv').get('oc_proposals_v1');
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  db.close();
  return typeof raw === 'string' ? raw.slice(0, 5) : String(raw);
});
ok(scelle === 'OCV1.', 'proposition scellée au repos, vu : ' + scelle);
/* rechargement + verrouillage/déverrouillage : rien ne se perd */
await page.reload({ waitUntil: 'load' });
await deverrouiller();
await page.waitForSelector('#tdProps', { timeout: 15000 });
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/96-mcp-chip-aujourdhui.png' });
console.log('proposition scellée, retrouvée après rechargement + kill du Compagnon ✓');

/* ---------- 12-15 : aperçu, décocher, fusion sûre, Annuler ---------- */
await page.click('#tdProps');
await page.waitForSelector('[data-sel]');
ok(await page.$$eval('[data-sel]', els => els.length) === 2, '2 propositions à trier');
/* fermer la feuille ne consomme pas */
await page.click('.modal-f .btn-ghost:has-text("Annuler")');
await page.waitForSelector('#tdProps');
await page.click('#tdProps');
await page.waitForSelector('[data-sel]');
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/97-mcp-apercu.png' });
await page.click('[data-sel]:has-text("Exotec")');
await page.click('.modal-f .btn-primary');
await page.waitForSelector('.undo-bar');
const etat = await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  const data = JSON.parse(await st.kvGet(st.DATA_KEY));
  const sopra = data.find(c => c.name === 'Sopra Steria');
  const props = JSON.parse(await st.kvGet(st.PROPOSALS_KEY) || 'null');
  return {
    names: data.map(c => c.name).sort().join(','),
    domain: sopra && sopra.domain,
    positions: sopra && sopra.positions,
    status: sopra && sopra.status,
    link: (sopra && sopra.contacts[0] && sopra.contacts[0].link) || '',
    conf: (sopra && sopra.contacts[0] && sopra.contacts[0].conf) || '',
    pending: props ? props.list.length : 0,
    done: props ? props.done.map(d => d.a) : []
  };
});
ok(etat.names === 'Alpha Cyber,Beta Cloud,Sopra Steria', 'fusion attendue : ' + etat.names);
ok(etat.domain === 'autre', 'vocabulaire domaine non ramené : ' + etat.domain);
ok(JSON.stringify(etat.positions) === '["stage"]', 'vocabulaire postes non ramené : ' + JSON.stringify(etat.positions));
ok(etat.status === 'todo', 'le statut arrive vierge : ' + etat.status);
ok(!/javascript:/i.test(etat.link), 'lien piégé non neutralisé : ' + etat.link);
ok(etat.conf !== 'ok', 'confiance transmise à tort');
ok(etat.pending === 0 && JSON.stringify(etat.done) === '["fusion"]', 'proposition non consommée après fusion');
ok(!(await page.$('#tdProps')), 'chip encore là après fusion');
/* le Compagnon n'a plus rien en attente (réglée) */
const resteCompagnon = await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  const { probeCompanion, companionCall } = await import('./engine/companion.js');
  const assoc = JSON.parse(await st.kvGet(st.COMPANION_KEY));
  const found = await probeCompanion();
  const rep = await companionCall(found.base, assoc.k, { t: 'propositions' });
  return rep.liste.length;
});
ok(resteCompagnon === 0, 'proposition non réglée côté Compagnon');
/* Annuler ~30 s : tout revient comme avant */
await page.click('.undo-bar .btn-sm');
await attendre(() => page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  return JSON.parse(await st.kvGet(st.DATA_KEY)).length === 2;
}), 5000, 'restauration après Annuler');
console.log('aperçu → décocher → fusion sûre → Annuler restauré ✓');

/* ---------- 16 : rejeu d'une proposition déjà traitée ---------- */
const c2 = new ClientMcp();
await c2.init();
const rejeu = await c2.outil('proposer_pistes', P1);
ok(rejeu.result.isError && /déjà été traitée/.test(rejeu.result.content[0].text),
  'rejeu après fusion accepté à tort');
await page.evaluate(async () => (await import('./ui/propositions.js')).reconcileProposals());
await new Promise(r => setTimeout(r, 1200));
ok(!(await page.$('#tdProps')), 'le rejeu a recréé un aperçu');

/* ---------- écarter, avec retour en arrière ---------- */
const P2 = { pistes: [{ name: 'Nouvelle Piste', city: 'Paris' }] };
const d2 = await c2.outil('proposer_pistes', P2);
ok(!d2.result.isError, 'dépôt de la seconde proposition');
await c2.fermer();
await page.evaluate(async () => (await import('./ui/propositions.js')).reconcileProposals());
await page.waitForSelector('#tdProps', { timeout: 15000 });

/* ---------- mobile 390×844, thème sombre, cibles 44 px ---------- */
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#btnTheme');
await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
await page.waitForSelector('#tdProps');
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/98-mcp-mobile-sombre.png' });
await page.click('#tdProps');
await page.waitForSelector('[data-sel]');
const tailles = await page.evaluate(() => {
  const h = s => Math.round(document.querySelector(s)?.getBoundingClientRect().height || 0);
  return { sel: h('[data-sel]'), discard: h('#rcDiscard'), foot: h('.modal-f .btn-primary') };
});
for (const [quoi, px] of Object.entries(tailles))
  ok(px >= 44, `cible tactile trop petite (${quoi} : ${px}px)`);
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/99-mcp-apercu-mobile-sombre.png' });
/* écarter — puis retour en arrière par la barre Annuler */
await page.click('#rcDiscard');
await page.waitForSelector('.undo-bar');
ok(!(await page.$('#tdProps')), 'chip encore là après écart');
await page.click('.undo-bar .btn-sm');
await page.waitForSelector('#tdProps', { timeout: 10000 });
console.log('mobile sombre, cibles ≥ 44 px, écarter + retour ✓');

/* ---------- 17 : révocation locale immédiate ---------- */
await openCompanionSheet();
await page.waitForSelector('#cgMcp');
ok((await page.evaluate(() => Math.round(document.querySelector('#cgMcp').getBoundingClientRect().height))) >= 44,
  'cible tactile de la ligne assistant');
await page.click('#cgMcp');
await page.waitForSelector('.modal-f .btn-primary:has-text("Couper")');
await page.click('.modal-f .btn-primary:has-text("Couper")');
await attendre(() => page.evaluate(() =>
  document.querySelector('#cgMcpSt')?.textContent.includes('coupé')), 10000, 'assistant coupé');
const c3 = new ClientMcp();
await c3.init();
const coupe = await c3.outil('resume_pistes', {});
ok(coupe.result.isError && /coupé/.test(coupe.result.content[0].text), 'lecture possible après révocation');
const coupeProp = await c3.outil('proposer_pistes', P2);
ok(coupeProp.result.isError, 'dépôt possible après révocation');
const sortie = await c3.fermer();
ok(sortie === 0, 'le serveur MCP ne s’arrête pas proprement (code ' + sortie + ')');
console.log('révocation immédiate depuis la PWA + arrêt propre ✓');

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
tuerCompagnon();
await browser.close();
server.close();
console.log(process.exitCode ? 'E2E mcp : ÉCHEC' : 'E2E mcp : OK');
