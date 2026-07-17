/* E2E C2 : l'appairage du Compagnon — la PWA (profil protégé,
   appareil principal) découvre un Compagnon sur l'ordinateur,
   prouve le code court, reçoit la clé de canal, l'inscrit dans
   l'anneau (rôle companion), montre l'état « prêt », puis rompt.
   Le faux Compagnon parle EXACTEMENT le protocole du vrai (mêmes
   enveloppes OCV1, même dérivation du code — vecteurs verrouillés
   par cargo test côté Rust). Mauvais code → refus propre. */
import { chromium, chromiumPath, SHOTS, serveRepo } from './outils.mjs';
import http from 'http';
import { webcrypto as wc } from 'crypto';

/* ---------- le faux Compagnon (protocole du canal) ---------- */
const b64 = u => Buffer.from(u).toString('base64');
const unb64 = s => new Uint8Array(Buffer.from(s, 'base64'));
const te = new TextEncoder();
const aesKey = (raw, u) => wc.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, u);
async function sceller(raw, nom, clair){
  const iv = wc.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await wc.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: te.encode('OCV1|' + nom) },
    await aesKey(raw, ['encrypt']), te.encode(clair)));
  return 'OCV1.' + b64(iv) + '.' + b64(ct);
}
async function ouvrir(raw, nom, env){
  const p = env.split('.');
  const pt = await wc.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(p[1]), additionalData: te.encode('OCV1|' + nom) },
    await aesKey(raw, ['decrypt']), unb64(p[2]));
  return new TextDecoder().decode(pt);
}
const CODE = 'ABCD-2345';
const sel = wc.getRandomValues(new Uint8Array(16));
const kc = new Uint8Array(await wc.subtle.deriveBits(
  { name: 'PBKDF2', salt: sel, iterations: 120000, hash: 'SHA-256' },
  await wc.subtle.importKey('raw', te.encode('code:' + CODE), 'PBKDF2', false, ['deriveBits']), 256));

const faux = { appairage: false, assoc: null, k: null, recus: [] };
const fauxSrv = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS'){ res.writeHead(204); res.end(); return; }
  let body = '';
  for await (const ch of req) body += ch;
  try {
    if (req.method === 'GET' && req.url === '/oc-compagnon'){
      res.end(JSON.stringify({ v: 1, nom: 'FauxOrdi', associe: !!faux.assoc,
        appairage: faux.appairage ? { s: b64(sel) } : null }));
    } else if (req.method === 'POST' && req.url === '/appairage'){
      const clair = JSON.parse(await ouvrir(kc, 'canal-appairage', JSON.parse(body).d));
      faux.assoc = clair;
      faux.k = wc.getRandomValues(new Uint8Array(32));
      faux.appairage = false;
      const rep = { compagnon: { id: 'cgfaux', name: 'FauxOrdi', role: 'companion',
        pub: 'A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg' }, k: b64(faux.k) };
      res.end(JSON.stringify({ d: await sceller(kc, 'canal-appairage', JSON.stringify(rep)) }));
    } else if (req.method === 'POST' && req.url === '/boite'){
      const msg = JSON.parse(await ouvrir(faux.k, 'canal', JSON.parse(body).d));
      faux.recus.push(msg);
      const rep = msg.t === 'ping'
        ? { t: 'pong', nom: 'FauxOrdi', associe: true }
        : (msg.t === 'dissocier' ? (faux.assoc = null, { t: 'ok' }) : { t: '?' });
      res.end(JSON.stringify({ d: await sceller(faux.k, 'canal', JSON.stringify(rep)) }));
    } else { res.writeHead(404); res.end('{}'); }
  } catch (e) { res.writeHead(403); res.end(JSON.stringify({ e: 'code' })); }
});
await new Promise(r => fauxSrv.listen(17095, '127.0.0.1', r));

/* ---------- la PWA ---------- */
const { server, base } = await serveRepo();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
/* le 403 du mauvais code est VOULU (refus propre) — pas une erreur */
page.on('console', m => {
  if (m.type() === 'error' && !/403|Forbidden/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', e => errors.push(String(e)));
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };
const tapIn = async (scope, code) => {
  for (const d of code) await page.click(`${scope} .pad-k[data-d="${d}"]`);
};

/* profil protégé posé directement (itérations réduites : vitesse) */
await page.goto(base, { waitUntil: 'load' });
await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  await st.kvInit();
  const { createVault, makeVaultPhrase } = await import('./engine/vault.js');
  const phrase = makeVaultPhrase();
  const made = await createVault('280941', phrase, { iter: 15000 });
  await st.kvSet(st.VAULT_KEY, JSON.stringify(made.meta));
  localStorage.setItem('t_phrase', phrase);
});
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.lock .pad-k');
await tapIn('.lock', '280941');
await page.waitForFunction(() => !document.querySelector('.lock'), null, { timeout: 10000 });
await page.evaluate(async () => {
  const { ensureRing } = await import('./ui/synclive.js');
  await ensureRing(localStorage.getItem('t_phrase'));
});
console.log('profil protégé + anneau posés ✓');

/* Mes appareils → Ajouter le Compagnon */
await page.evaluate(async () => (await import('./ui/direct.js')).openAppareils());
await page.waitForSelector('#devAddComp');
await page.click('#devAddComp');
await page.waitForSelector('.modal-f .btn-primary');
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/70-ajouter-compagnon.png' });
await page.click('.modal-f .btn-primary');            /* Je l'ai ouvert — chercher */
/* le Compagnon est là mais n'affiche pas encore de code */
await page.waitForSelector('.modal-f button:has-text("J’ai le code")');
faux.appairage = true;                                /* l'utilisateur clique « Afficher le code » */
await page.click('.modal-f button:has-text("J’ai le code")');
await page.waitForSelector('#cgCode');

/* mauvais code : refus propre, rien d'écrit */
await page.fill('#cgCode', 'ZZZZ9999');
await page.click('.modal-f button:has-text("Associer")');
await page.waitForSelector('#rqPad .pad-k');
await tapIn('#rqPad', '280941');
await page.waitForFunction(() => /pas ce code/.test(document.querySelector('#cgErr')?.textContent || ''), null, { timeout: 10000 });
console.log('mauvais code refusé proprement ✓');

/* bon code (tolérance : minuscules sans tiret) */
await page.fill('#cgCode', 'abcd2345');
await page.click('.modal-f button:has-text("Associer")');
await page.waitForSelector('#rqPad .pad-k');
await tapIn('#rqPad', '280941');
await page.waitForSelector('.toast.on', { timeout: 15000 });
const t1 = await page.textContent('.toast.on');
if (!/FauxOrdi/.test(t1)) fail('toast d’association : ' + t1);

/* l'association est réelle : clé stockée SCELLÉE, anneau à jour */
const etat = await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  const assoc = JSON.parse(await st.kvGet(st.COMPANION_KEY));
  const brut = await new Promise(res => {
    const o = indexedDB.open('oc_kv_v1', 1);
    o.onsuccess = () => { const rq = o.result.transaction('kv').objectStore('kv').get('oc_companion_v1');
      rq.onsuccess = () => res(String(rq.result || '')); };
  });
  const { getRing } = await import('./ui/synclive.js');
  const { deviceIn } = await import('./engine/ring.js');
  const d = deviceIn(getRing(), assoc.id);
  return { nom: assoc.nom, hasK: !!assoc.k, scelle: brut.slice(0, 5), role: d && d.role };
});
if (etat.nom !== 'FauxOrdi' || !etat.hasK) fail('association stockée : ' + JSON.stringify(etat));
if (etat.scelle !== 'OCV1.') fail('oc_companion_v1 doit être scellée, vu : ' + etat.scelle);
if (etat.role !== 'companion') fail('rôle dans l’anneau : ' + etat.role);
if (!faux.assoc || !faux.assoc.device || !faux.assoc.device.pub) fail('le Compagnon n’a pas reçu l’identité');
if (!faux.assoc.ring || !faux.assoc.ring.main) fail('le Compagnon n’a pas reçu l’anneau');
console.log('clé scellée, anneau (rôle companion) et identités échangés ✓');

/* la feuille montre la ligne compagnon, présence « prêt » */
await page.waitForSelector('#devComp');
await page.waitForFunction(() => /prêt/.test(document.querySelector('#devCompSub')?.textContent || ''), null, { timeout: 8000 });
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '/71-compagnon-pret.png' });

/* rompre : le Compagnon prévenu, la clé oubliée, l'anneau nettoyé */
await page.click('#devComp');
await page.waitForSelector('#cgBreak');
await page.click('#cgBreak');
await page.waitForSelector('.modal-f button:has-text("Rompre")');
await page.click('.modal-f button:has-text("Rompre")');
await page.waitForSelector('#rqPad .pad-k');
await tapIn('#rqPad', '280941');
await page.waitForFunction(() => /rompue/.test(document.querySelector('.toast.on')?.textContent || ''), null, { timeout: 10000 });
const apres = await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  const { getRing } = await import('./ui/synclive.js');
  const { deviceIn } = await import('./engine/ring.js');
  return { cle: await st.kvGet(st.COMPANION_KEY), dans: !!deviceIn(getRing(), 'cgfaux') };
});
if (apres.cle) fail('la clé de canal devrait être oubliée');
if (apres.dans) fail('le compagnon devrait être sorti de l’anneau');
if (!faux.recus.some(m => m.t === 'dissocier')) fail('le Compagnon n’a pas été prévenu de la rupture');
if (faux.assoc) fail('le faux Compagnon se croit encore associé');
console.log('rupture propre : clé oubliée, anneau nettoyé, Compagnon prévenu ✓');

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
await browser.close();
server.close();
fauxSrv.close();
console.log(process.exitCode ? 'E2E compagnon : ÉCHEC' : 'E2E compagnon : OK');
