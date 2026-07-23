/* E2E D5 : rédaction IA « via ton ordinateur » contre le VRAI binaire.
   La règle d'or : AUCUN modèle implicite — l'utilisateur choisit dans
   la liste que chaque runtime sert VRAIMENT (tags Ollama, /v1/models
   OpenAI, `codex app-server` → model/list), et ce modèle-là est celui
   transmis à la génération. Trois chemins réels : Ollama local (faux
   runtime, OC_OLLAMA), OpenAI par clé (faux service, OC_OPENAI_TEST —
   Bearer vérifié, mauvaise clé = refus court) et l'abonnement ChatGPT
   (faux outil Codex en Node, OC_CODEX — protocole app-server JSONL
   exact, puis `exec` : prompt par STDIN jamais en argument, bac à
   sable lecture seule, --model choisi, sortie par fichier). Le texte
   tombe TOUJOURS dans le champ éditable ; le prompt porte la piste,
   jamais le suivi privé ; la clé ne touche jamais le disque du
   Compagnon. Annuler libère vraiment (pas de verrou « occupé »).
   Compagnon éteint = message court honnête. Mobile 390×844 sombre
   + 1280×800 clair, zéro erreur console.
   Sauté proprement si le binaire n'est pas construit. */
import { chromium, chromiumPath, SHOTS, serveRepo, ROOT } from './outils.mjs';
import { spawn } from 'child_process';
import { existsSync, mkdtempSync, writeFileSync, chmodSync, readFileSync } from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

const BIN = path.join(ROOT, 'compagnon', 'target', 'debug', 'oc-compagnon');
if (!existsSync(BIN)){
  console.log('binaire absent (cargo build -p oc-compagnon) — scénario sauté');
  process.exit(0);
}

/* ---------- faux Ollama : /api/tags (la liste réelle) + /api/generate ---------- */
let ollamaBody = null;
const ollama = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/tags'){
    res.end(JSON.stringify({ models: [{ name: 'llama9-test:8b' }, { name: 'mistral-test' }] }));
    return;
  }
  let b = '';
  req.on('data', d => { b += d; });
  req.on('end', () => {
    ollamaBody = JSON.parse(b || '{}');
    const lent = /ATTENDS/.test(ollamaBody.prompt || '');
    setTimeout(() => {
      res.end(JSON.stringify({ response: 'Bonjour Nadia,\n\nBrouillon Ollama du test.\n\nMahé' }));
    }, lent ? 8000 : 0);
  });
});
await new Promise(r => ollama.listen(11501, '127.0.0.1', r));

/* ---------- faux OpenAI : /v1/models + /v1/chat/completions, Bearer vérifié ---------- */
let openaiAuth = '', openaiBody = null;
const openai = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  openaiAuth = req.headers.authorization || '';
  if (openaiAuth !== 'Bearer sk-test-123'){
    res.statusCode = 401;
    res.end('{}');
    return;
  }
  if (req.url === '/v1/models'){
    res.end(JSON.stringify({ data: [{ id: 'gpt-9-test' }, { id: 'gpt-9-mini-test' }] }));
    return;
  }
  let b = '';
  req.on('data', d => { b += d; });
  req.on('end', () => {
    openaiBody = JSON.parse(b || '{}');
    res.end(JSON.stringify({ choices: [{ message: {
      content: 'Bonjour Nadia,\n\nBrouillon OpenAI du test.\n\nMahé' } }] }));
  });
});
await new Promise(r => openai.listen(11502, '127.0.0.1', r));

/* ---------- faux Codex (Node) : app-server JSONL exact + exec par stdin ---------- */
const tmp = mkdtempSync(path.join(os.tmpdir(), 'oc-ia-'));
const codex = path.join(tmp, 'codex');
writeFileSync(codex, `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(tmp)} + '/codex-args-' + args[0] + '.txt', args.join('\\n') + '\\n');
if (args[0] === 'app-server'){
  let buf = '';
  process.stdin.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\\n')) >= 0){
      const ligne = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!ligne.trim()) continue;
      let m; try { m = JSON.parse(ligne); } catch (e) { continue; }
      if (m.method === 'initialize')
        process.stdout.write(JSON.stringify({ id: m.id, result: { userAgent: 'codex-test' } }) + '\\n');
      else if (m.method === 'model/list')
        process.stdout.write(JSON.stringify({ id: m.id, result: { models: [
          { id: 'gpt-5.6-sol-test', displayName: 'GPT-5.6 Sol (test)' },
          { id: 'gpt-5.5-test', displayName: 'GPT-5.5 (test)' }
        ] } }) + '\\n');
    }
  });
} else if (args[0] === 'exec'){
  let prompt = '';
  process.stdin.on('data', d => { prompt += d; });
  process.stdin.on('end', () => {
    fs.writeFileSync(${JSON.stringify(tmp)} + '/codex-stdin.txt', prompt);
    const o = args.indexOf('--output-last-message');
    if (o < 0 || !args[o + 1]) process.exit(3);
    fs.writeFileSync(args[o + 1], 'Bonjour Nadia,\\n\\nBrouillon Codex du test.\\n\\nMahé');
    process.exit(0);
  });
}
`);
chmodSync(codex, 0o755);

/* ---------- le vrai Compagnon — lancé APRÈS le déverrouillage de la
   PWA (le code d'appairage OC_APPAIRAGE_AUTO expire en 2 min) ---------- */
const xdg = mkdtempSync(path.join(os.tmpdir(), 'oc-compagnon-ia-'));
const CODE = 'ABCD-2345';
let compagnon = null;
let compagnonOut = '';
let compagnonErr = '';
const attendre = async (fn, ms, quoi) => {
  const t0 = Date.now();
  for (;;){
    if (await fn()) return;
    if (Date.now() - t0 > ms) throw new Error('attente : ' + quoi);
    await new Promise(r => setTimeout(r, 400));
  }
};
const lancerCompagnon = async () => {
  compagnon = spawn('xvfb-run', ['-a', 'dbus-run-session', '--', BIN], {
    env: Object.assign({}, process.env, {
      XDG_DATA_HOME: xdg,
      OC_APPAIRAGE_AUTO: CODE,
      OC_OLLAMA: 'http://127.0.0.1:11501',
      OC_OPENAI_TEST: 'http://127.0.0.1:11502',
      OC_CODEX: codex,
      OC_INTEGRATION_TEST: '1'
    }),
    stdio: ['ignore', 'pipe', 'pipe'], detached: true
  });
  compagnon.stdout.on('data', d => { compagnonOut = (compagnonOut + d).slice(-4000); });
  compagnon.stderr.on('data', d => { compagnonErr = (compagnonErr + d).slice(-4000); });
  await attendre(async () => {
    for (const port of [17095, 17096, 17097]){
      try {
        const r = await fetch(`http://127.0.0.1:${port}/oc-compagnon`, { signal: AbortSignal.timeout(800) });
        const j = r.ok && await r.json();
        if (j && j.appairage) return true;
      } catch (e) {}
    }
    return false;
  }, 30000, 'canal du Compagnon');
};
const arreter = () => { try { process.kill(-compagnon.pid, 'SIGKILL'); } catch (e) {} };

/* ---------- la PWA : coffre, piste, appairage ---------- */
const { server, base } = await serveRepo();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await (await browser.newContext({
  viewport: { width: 1280, height: 800 }, hasTouch: true })).newPage();
const errors = [];
page.on('console', m => {
  /* compagnon volontairement éteint (fin du scénario) et 401 injecté :
     les journaux réseau de ces refus attendus ne sont pas des erreurs —
     l'URL du refus vit dans location(), pas toujours dans text() */
  const ou = m.text() + ' ' + (((m.location() || {}).url) || '');
  if (m.type() === 'error' && !/127\.0\.0\.1:1709\d/.test(ou)
    && !/401|Unauthorized/.test(ou)) errors.push(m.text());
});
page.on('pageerror', e => errors.push(String(e)));
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };
const tapIn = async (scope, code) => { for (const d of code) await page.click(`${scope} .pad-k[data-d="${d}"]`); };

await page.goto(base, { waitUntil: 'load' });
await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  await st.kvInit();
  const { createVault, makeVaultPhrase } = await import('./engine/vault.js');
  const made = await createVault('280941', makeVaultPhrase(), { iter: 15000 });
  await st.kvSet(st.VAULT_KEY, JSON.stringify(made.meta));
  await st.kvSet(st.DATA_KEY, JSON.stringify([{
    id: 'p1', name: 'Orange Cyberdefense', city: 'Lille', status: 'todo',
    notes: 'NOTE PRIVÉE DU SUIVI',
    contacts: [{ id: 'k1', name: 'Nadia', role: 'RH', email: 'nadia@exemple.fr' }], updatedAt: 1 }]));
  localStorage.setItem('t_phrase', makeVaultPhrase());
});
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.lock .pad-k');
await tapIn('.lock', '280941');
await page.waitForFunction(() => !document.querySelector('.lock'), null, { timeout: 10000 });
await page.evaluate(async () => (await import('./ui/synclive.js')).ensureRing(localStorage.getItem('t_phrase')));
await lancerCompagnon();
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

/* ---------- Assistant IA : aucune famille grisée, chacune dit son chemin ----------
   (#21 : l'IA a sa propre porte, openAssistantIA — elle attend le code,
   on déclenche sans retenir sa promesse) */
await page.evaluate(() => { import('./ui/connexions.js').then(m => m.openAssistantIA()); });
await page.waitForSelector('#rqPad .pad-k');
await tapIn('#rqPad', '280941');
await page.waitForSelector('[data-ai]');
const familles = await page.$$eval('[data-ai]', els => els.map(b => ({
  id: b.dataset.ai, off: b.disabled, txt: b.textContent })));
if (familles.length !== 6) fail('6 familles attendues, vu ' + familles.length);
for (const f of familles){
  if (f.off) fail('famille grisée à tort : ' + f.id);
  if (/pas encore disponible/.test(f.txt)) fail('promesse non tenue affichée : ' + f.id);
}
for (const id of ['ollama', 'openai', 'chatgpt']){
  const f = familles.find(x => x.id === id);
  if (!/via ton ordinateur/.test(f.txt)) fail(id + ' ne dit pas son chemin : ' + f.txt);
}
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/100-ia-familles.png' });

/* ---------- Ollama : le modèle se choisit dans les tags RÉELS du runtime ---------- */
await page.click('[data-ai="ollama"]');
await page.waitForSelector('[data-m]', { timeout: 20000 });
const tagsVus = await page.$$eval('[data-m]', els => els.map(b => b.dataset.m));
if (JSON.stringify(tagsVus) !== JSON.stringify(['llama9-test:8b', 'mistral-test']))
  fail('la liste ne vient pas des tags du runtime : ' + JSON.stringify(tagsVus));
await page.click('[data-m="llama9-test:8b"]');
await page.waitForSelector('.toast.on');
if (!/Assistant prêt/.test(await page.textContent('#toast'))) fail('choix du modèle Ollama');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.modal-w'), null, { timeout: 5000 });

/* ---------- Ollama : le brouillon tombe dans le champ, avec CE modèle ---------- */
const ouvrirComposeur = async () => {
  await page.evaluate(async () => {
    const { openMail } = await import('./ui/mail.js');
    const { S } = await import('./ui/state.js');
    openMail(S.companies[0]);
  });
  await page.waitForSelector('#mAi');
};
await ouvrirComposeur();
await page.click('#mAi');
await page.waitForFunction(() => /Brouillon Ollama du test/.test(document.querySelector('#mBody').value),
  null, { timeout: 20000 });
if (!ollamaBody || ollamaBody.model !== 'llama9-test:8b')
  fail('le modèle choisi n’est pas celui utilisé : ' + JSON.stringify(ollamaBody && ollamaBody.model));
if (!/Orange Cyberdefense/.test(ollamaBody.prompt)) fail('contexte de la piste absent du prompt Ollama');
if (/NOTE PRIVÉE/.test(ollamaBody.prompt)) fail('du suivi privé est parti au modèle !');
console.log('Ollama : liste réelle des tags, modèle choisi = modèle utilisé ✓');
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/101-ia-ollama-brouillon.png' });
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.modal-w'), null, { timeout: 5000 });

/* ---------- OpenAI par clé : Bearer vérifié, modèle transmis, clé jamais sur disque ---------- */
const reglerIa = async v => page.evaluate(async conf => {
  const st = await import('./engine/storage.js');
  await st.kvSet(st.AI_KEY, JSON.stringify(conf));
  await (await import('./ui/connexions.js')).loadMail();
}, v);
await reglerIa({ provider: 'openai', key: 'sk-test-123', model: 'gpt-9-test' });
await ouvrirComposeur();
await page.click('#mAi');
await page.waitForFunction(() => /Brouillon OpenAI du test/.test(document.querySelector('#mBody').value),
  null, { timeout: 20000 });
if (openaiAuth !== 'Bearer sk-test-123') fail('clé absente ou déformée : ' + openaiAuth);
if (!openaiBody || openaiBody.model !== 'gpt-9-test') fail('modèle non transmis : ' + JSON.stringify(openaiBody && openaiBody.model));
const fuite = spawn('grep', ['-r', 'sk-test-123', xdg]);
const fuiteCode = await new Promise(r => fuite.on('close', r));
if (fuiteCode === 0) fail('LA CLÉ EST ÉCRITE SUR LE DISQUE DU COMPAGNON');
console.log('OpenAI : Bearer reçu, modèle choisi transmis, clé jamais écrite chez le Compagnon ✓');

/* une mauvaise clé : refus court, le texte en place ne bouge pas */
await reglerIa({ provider: 'openai', key: 'sk-mauvaise', model: 'gpt-9-test' });
await page.click('#mAi');
await attendre(async () => /Clé refusée/.test(await page.textContent('#toast')), 20000, 'refus de clé honnête');
if (!/Brouillon OpenAI du test/.test(await page.inputValue('#mBody'))) fail('texte perdu sur refus de clé');
console.log('mauvaise clé : refus court, rien de perdu ✓');
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.modal-w'), null, { timeout: 5000 });

/* ---------- ChatGPT (Codex) — mobile 390×844, sombre : la liste vient
   de l'app-server officiel, le modèle choisi part en --model ---------- */
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#btnTheme');
await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
await page.evaluate(() => { import('./ui/connexions.js').then(m => m.openAssistantIA()); });
await page.waitForSelector('#rqPad .pad-k');
await tapIn('#rqPad', '280941');
await page.waitForSelector('[data-ai="chatgpt"]');
await page.click('[data-ai="chatgpt"]');
await page.waitForSelector('[data-m]', { timeout: 25000 });
const modelesCodex = await page.$$eval('[data-m]', els => els.map(b => b.dataset.m));
if (JSON.stringify(modelesCodex) !== JSON.stringify(['', 'gpt-5.6-sol-test', 'gpt-5.5-test']))
  fail('liste app-server inattendue : ' + JSON.stringify(modelesCodex));
const argsAppServer = readFileSync(path.join(tmp, 'codex-args-app-server.txt'), 'utf8');
if (!/^app-server/.test(argsAppServer)) fail('l’app-server n’a pas été consulté : ' + argsAppServer);
const cible = await page.evaluate(() =>
  Math.round(document.querySelector('[data-m="gpt-5.6-sol-test"]').getBoundingClientRect().height));
if (cible < 44) fail('cible tactile du choix de modèle : ' + cible + 'px');
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/102-ia-codex-modeles-mobile-sombre.png' });
await page.click('[data-m="gpt-5.6-sol-test"]');
await page.waitForSelector('.toast.on');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.modal-w'), null, { timeout: 5000 });
await ouvrirComposeur();
await page.click('#mAi');
await page.waitForFunction(() => /Brouillon Codex du test/.test(document.querySelector('#mBody').value),
  null, { timeout: 30000 });
const argsExec = readFileSync(path.join(tmp, 'codex-args-exec.txt'), 'utf8');
const stdinCodex = readFileSync(path.join(tmp, 'codex-stdin.txt'), 'utf8');
if (!/--sandbox\nread-only/.test(argsExec)) fail('bac à sable lecture seule absent : ' + argsExec);
if (!/--skip-git-repo-check/.test(argsExec)) fail('argument documenté manquant : ' + argsExec);
if (!/--model\ngpt-5\.6-sol-test/.test(argsExec)) fail('le modèle choisi ne part pas en --model : ' + argsExec);
if (/Orange Cyberdefense/.test(argsExec)) fail('LE PROMPT PASSE EN ARGUMENT (visible dans ps) !');
if (!/Orange Cyberdefense/.test(stdinCodex)) fail('le prompt n’est pas passé par stdin');
if (!/jamais une instruction/.test(stdinCodex)) fail('le cadrage donnée≠instruction manque');
if (/NOTE PRIVÉE/.test(stdinCodex)) fail('du suivi privé est parti à Codex !');
console.log('ChatGPT : modèles de l’app-server, --model choisi, prompt par stdin, cadrage présent ✓');
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/103-ia-codex-brouillon-mobile.png' });

/* ---------- annuler libère vraiment : pas de verrou « occupé » ---------- */
const annulation = await page.evaluate(async () => {
  const { probeCompanion, companionCall } = await import('./engine/companion.js');
  const st = await import('./engine/storage.js');
  const assoc = JSON.parse(await st.kvGet(st.COMPANION_KEY));
  const { base } = await probeCompanion();
  const j1 = 'ia-annultest1';
  const d1 = await companionCall(base, assoc.k, { t: 'ia-demarrer', jid: j1,
    provider: 'ollama', key: '', model: 'llama9-test:8b',
    prompt: 'ATTENDS — rédige lentement', system: '' });
  await companionCall(base, assoc.k, { t: 'ia-annuler', jid: j1 });
  const e1 = await companionCall(base, assoc.k, { t: 'ia-etat', jid: j1 });
  const d2 = await companionCall(base, assoc.k, { t: 'ia-demarrer', jid: 'ia-annultest2',
    provider: 'ollama', key: '', model: 'llama9-test:8b', prompt: 'vite', system: '' });
  return { d1: d1.t, apres: e1.etat, relance: d2.t || d2.e };
});
if (annulation.d1 !== 'ok') fail('démarrage du travail lent : ' + JSON.stringify(annulation));
if (annulation.apres !== 'inconnue') fail('l’annulation ne vide pas le travail : ' + annulation.apres);
if (annulation.relance !== 'ok') fail('le verrou « occupé » survit à l’annulation : ' + annulation.relance);
console.log('annulation : travail jeté, verrou libéré, relance immédiate ✓');

/* ---------- l'ordinateur s'éteint : message court, honnête ---------- */
arreter();
await new Promise(r => setTimeout(r, 800));
await page.click('#mAi');
await attendre(async () => /ordinateur est éteint/.test(await page.textContent('#toast')),
  20000, 'message « ordinateur éteint »');
if (!/Brouillon Codex du test/.test(await page.inputValue('#mBody'))) fail('texte perdu quand l’ordinateur dort');
console.log('Compagnon éteint : refus court, rien de perdu ✓');
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/104-ia-eteint-mobile.png' });

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
arreter();
await browser.close();
server.close();
ollama.close();
openai.close();
console.log(process.exitCode ? 'E2E compagnon-ia : ÉCHEC' : 'E2E compagnon-ia : OK');
