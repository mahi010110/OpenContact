/* E2E durcissement : le retour OAuth sous service worker.
   Le SW ressert index.html à toute navigation (app une-page) — il ne
   doit JAMAIS détourner oauth.html, sinon la fenêtre d'autorisation
   rouvre l'app et le jeton n'arrive pas. On vérifie, SW au contrôle :
   1. une navigation vers /oauth.html sert bien la page de retour ;
   2. le postMessage same-origin (le vrai canal du jeton) fonctionne ;
   3. une navigation normale ressert bien l'app. */
import { chromium, chromiumPath, SHOTS, serveRepo } from './outils.mjs';

const { server, base } = await serveRepo();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };

/* 1. l'app s'ouvre et son service worker prend le contrôle */
await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 })
  .catch(() => fail('le service worker n’a jamais pris le contrôle'));
console.log('service worker au contrôle ✓');

/* 2. navigation directe vers oauth.html — elle doit se servir ELLE-MÊME */
await page.goto(base + '/oauth.html#access_token=TEST&token_type=bearer', { waitUntil: 'load' });
const title = await page.title();
if (title !== 'OpenContact — connexion') fail('oauth.html détourné par le SW — titre servi : ' + title);
if (await page.$('#app, .bottomnav')) fail('oauth.html détourné : l’app a été servie à la place');
console.log('oauth.html servi intact sous le SW ✓');
await page.screenshot({ path: SHOTS + '/60-oauth-sous-sw.png' });

/* 3. le vrai canal : popup ouverte par l'app, jeton reçu par postMessage */
await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 10000 });
const msg = await page.evaluate(() => new Promise((res, rej) => {
  setTimeout(() => rej(new Error('aucun message reçu en 8 s')), 8000);
  addEventListener('message', e => { if (e.data && e.data.oc === 'oauth') res(e.data); });
  open('./oauth.html#access_token=JETON-TEST&token_type=bearer');
})).catch(e => { fail('retour OAuth : ' + e.message); return null; });
if (msg && !/access_token=JETON-TEST/.test(msg.url)) fail('jeton absent du retour : ' + msg.url);
if (msg) console.log('postMessage du retour OAuth reçu par l’app ✓');

/* 4. une navigation ordinaire ressert l'app (page unique) */
await page.goto(base + '/#/pistes', { waitUntil: 'load' });
if (!/OpenContact/.test(await page.title()) || (await page.title()) === 'OpenContact — connexion')
  fail('navigation normale : l’app n’est plus servie — titre : ' + await page.title());
console.log('navigation normale : l’app répond ✓');

/* 5. hors ligne POUR DE VRAI : le serveur meurt, l'app doit revivre du
   cache au rechargement — pas une émulation que le SW contournerait */
await new Promise(r => { server.close(() => r()); server.closeAllConnections?.(); setTimeout(r, 1500); });
await page.reload({ waitUntil: 'load' }).catch(() => fail('rechargement hors ligne : la page n’a pas chargé'));
/* #sbVer existe vide dans le HTML : attendre que l'amorçage l'ait rempli */
await page.waitForFunction(() => /^\d+\.\d+/.test(document.querySelector('#sbVer')?.textContent.trim() || ''),
  null, { timeout: 15000 }).catch(() => fail('app hors ligne incomplète — amorçage inachevé'));
const vers = (await page.textContent('#sbVer')).trim();
if (!await page.$('.bottomnav')) fail('app hors ligne : navigation absente');
console.log('serveur coupé → rechargement : l’app revit du cache (v' + vers.trim() + ') ✓');

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
await browser.close();
console.log(process.exitCode ? 'E2E oauth-sw : ÉCHEC' : 'E2E oauth-sw : OK');
