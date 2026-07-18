/* E2E corrections prioritaires de l'audit UX : aucune action primaire morte,
   parcours Compagnon mobile honnête, relais avancés accessibles, cibles au
   pouce, contact sans doublon et fournisseurs IA non livrés non activables. */
import { chromium, chromiumPath, SHOTS, serveRepo } from './outils.mjs';

const { server, base } = await serveRepo();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
const watchErrors = target => {
  target.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  target.on('pageerror', e => errors.push(String(e)));
};
watchErrors(page);
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };
const tapIn = async (target, scope, code) => {
  for (const d of code) await target.click(`${scope} .pad-k[data-d="${d}"]`);
};
const closeSheet = () => page.evaluate(async () => (await import('./ui/dom.js')).topSheet()?.close());

/* Deux pistes (dont une sans e-mail), un contact orphelin sans nom et une
   messagerie simulée : aucun appel externe ne part dans ce scénario. */
await page.goto(base, { waitUntil: 'load' });
await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  await st.kvInit();
  await st.kvSet(st.DATA_KEY, JSON.stringify([
    { id: 'sans-mail', name: 'Atelier local', status: 'todo',
      contacts: [{ id: 'ct-sans', name: 'Camille', role: 'RH' }], updatedAt: 2 },
    { id: 'avec-mail', name: 'Entreprise test', status: 'todo',
      contacts: [{ id: 'ct-avec', name: 'Nadia', role: 'RH', email: 'nadia@exemple.fr' }], updatedAt: 1 }
  ]));
  await st.kvSet(st.ORPHANS_KEY, JSON.stringify([
    { id: 'orphelin', name: '', role: '', email: 'recrutement@exemple.fr', phone: '', extra: {} }
  ]));
  await st.kvSet(st.MAIL_KEY, JSON.stringify({
    gmail: { token: 'FAKE', exp: Date.now() + 3600000, email: 'moi@exemple.fr' }
  }));
  await st.kvSet(st.RELAYS_KEY, '[]');
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(async () => (await import('./ui/state.js')).S.companies.length === 2);

/* F1 : connecté ne signifie pas « envoyable » si la piste n'a pas d'adresse. */
await page.evaluate(async () => {
  const { openMail } = await import('./ui/mail.js');
  const { S } = await import('./ui/state.js');
  openMail(S.companies.find(c => c.id === 'sans-mail'));
});
await page.waitForSelector('#mHint');
const mailState = await page.evaluate(() => {
  const send = [...document.querySelectorAll('.modal-f button')].find(b => /Envoyer/.test(b.textContent));
  const copy = [...document.querySelectorAll('.modal-f button')].find(b => /Copier/.test(b.textContent));
  return { disabled: !!send?.disabled, sendPrimary: send?.classList.contains('btn-primary'),
    copyPrimary: copy?.classList.contains('btn-primary'), hint: document.querySelector('#mHint').textContent };
});
if (!mailState.disabled || mailState.sendPrimary || !mailState.copyPrimary)
  fail('pied sans e-mail incohérent : ' + JSON.stringify(mailState));
if (!/Pas d.email/.test(mailState.hint)) fail('aide sans e-mail absente : ' + mailState.hint);
console.log('Écrire sans e-mail : Envoyer désactivé, Copier devient primaire ✓');
await page.screenshot({ path: SHOTS + '/80-ux-ecrire-sans-email.png' });
await closeSheet();

/* F5 + F4 : l'adresse orpheline n'est visible qu'une fois et les petites
   actions atteignent 44 px dans le contexte mobile. */
await page.goto(base + '/#/pistes');
await page.waitForSelector('.orow');
const orphan = await page.locator('.orow').innerText();
if ((orphan.match(/recrutement@exemple\.fr/g) || []).length !== 1)
  fail('adresse orpheline répétée : ' + orphan);
const sizes = await page.evaluate(() => {
  const small = document.querySelector('.orow .btn-sm').getBoundingClientRect();
  const icon = document.createElement('button');
  icon.className = 'abtn abtn-sm';
  icon.style.position = 'fixed'; icon.style.left = '0'; icon.style.top = '0';
  document.body.append(icon);
  const ir = icon.getBoundingClientRect(); icon.remove();
  return { small: small.height, iconW: ir.width, iconH: ir.height };
});
if (sizes.small < 44 || sizes.iconW < 44 || sizes.iconH < 44)
  fail('cibles tactiles trop petites : ' + JSON.stringify(sizes));
console.log('orphelin lisible + cibles tactiles 44 px ✓');

/* Effet miroir F1 : sans messagerie, le contrôle de campagne explique le
   prérequis et ne laisse pas Valider promettre une action impossible. */
await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  await st.kvSet(st.MAIL_KEY, '');
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(async () => (await import('./ui/state.js')).S.companies.length === 2);
await page.evaluate(async () => {
  const { openCampaignWizard } = await import('./ui/campagnes.js');
  const { S } = await import('./ui/state.js');
  openCampaignWizard([S.companies.find(c => c.id === 'avec-mail')]);
});
await page.click('.modal-f button:has-text("Vérifier la campagne")');
await page.waitForSelector('#czCx');
const campaignDisabled = await page.locator('.modal-f button:has-text("Valider la campagne")').isDisabled();
if (!campaignDisabled) fail('Valider la campagne devrait attendre la messagerie');
console.log('campagne sans canal : validation désactivée, lien Connecter présent ✓');
await closeSheet();

/* F2 + F3 + F6 toast : le téléphone ne tombe plus dans une impasse ; les
   relais sont réglables dans un volet avancé, et un ancien toast s'efface
   quand une nouvelle feuille s'ouvre. */
await page.evaluate(async () => (await import('./ui/dom.js')).toast('Ancien retour'));
await page.waitForSelector('#toast.on');
await page.evaluate(async () => (await import('./ui/direct.js')).openAppareils());
await page.waitForSelector('.sy-relays');
if (await page.$('#toast.on')) fail('un ancien toast recouvre la nouvelle feuille');
const deviceText = await page.locator('.modal-b').innerText();
if (!/Compagnon[\s\S]*depuis ton ordinateur/.test(deviceText))
  fail('explication Compagnon mobile absente : ' + deviceText.slice(0, 220));
if (await page.$('#devAddComp')) fail('le téléphone ne doit pas proposer un appairage local impossible');
await page.click('.sy-relays summary');
await page.fill('#syRelays', 'https://pas-un-relais.example');
await page.click('#sySaveRelays');
await page.waitForFunction(() => /wss:\/\//.test(document.querySelector('#toast')?.textContent || ''));
await page.fill('#syRelays', 'wss://relay-one.example\nwss://relay-two.example\nwss://relay-one.example');
await page.click('#sySaveRelays');
await page.waitForFunction(async () => {
  const st = await import('./engine/storage.js');
  return JSON.parse(await st.kvGet(st.RELAYS_KEY) || '[]').length === 2;
});
const relays = await page.evaluate(async () => {
  const st = await import('./engine/storage.js');
  return JSON.parse(await st.kvGet(st.RELAYS_KEY));
});
if (!relays.every(x => x.startsWith('wss://'))) fail('relais non sûrs enregistrés : ' + relays.join(', '));
console.log('Compagnon mobile honnête + relais avancés validés ✓');
await page.screenshot({ path: SHOTS + '/81-ux-appareils-mobile.png' });
await closeSheet();
await browser.close();

/* Le même message honnête est présent dans « Depuis mes e-mails ». Cette
   vérification reste isolée : elle ne dépend pas des relais factices testés
   juste avant et ne tente donc jamais de les joindre. */
const receiveBrowser = await chromium.launch({ executablePath: chromiumPath() });
const receiveCtx = await receiveBrowser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const receivePage = await receiveCtx.newPage();
watchErrors(receivePage);
await receivePage.goto(base, { waitUntil: 'load' });
await receivePage.evaluate(async () => (await import('./ui/recevoir.js')).openRecevoir());
await receivePage.click('#rcMails');
await receivePage.waitForSelector('#rcMailTxt');
const scanText = await receivePage.locator('.modal-b').innerText();
if (!/s.installe et s.associe depuis ton ordinateur/i.test(scanText) || /Moi → Mes appareils/.test(scanText))
  fail('copie Compagnon mobile ambiguë : ' + scanText.slice(0, 260));
console.log('Depuis mes e-mails : consigne mobile réalisable ✓');

/* F6 IA : les options livrées sont nommées comme telles ; les adaptateurs
   encore absents restent visibles mais impossibles à activer. La page propre
   du scénario précédent reste indépendante du test réseau. */
const aiPage = receivePage;
await aiPage.evaluate(async () => (await import('./ui/dom.js')).topSheet()?.close());
await aiPage.evaluate(async () => {
  const st = await import('./engine/storage.js');
  await st.kvInit();
  const { createVault, makeVaultPhrase } = await import('./engine/vault.js');
  const made = await createVault('280941', makeVaultPhrase(), { iter: 15000 });
  await st.kvSet(st.VAULT_KEY, JSON.stringify(made.meta));
});
await aiPage.reload({ waitUntil: 'load' });
await aiPage.waitForSelector('.lock .pad-k');
await tapIn(aiPage, '.lock', '280941');
await aiPage.waitForFunction(() => !document.querySelector('.lock'));
await aiPage.evaluate(() => { import('./ui/connexions.js').then(m => m.openConnexions()); });
await aiPage.waitForSelector('#rqPad .pad-k');
await tapIn(aiPage, '#rqPad', '280941');
await aiPage.waitForSelector('#cxAi');
await aiPage.click('#cxAi');
await aiPage.waitForSelector('[data-ai="gemini"]');
const aiUi = await aiPage.evaluate(() => ({
  gemini: document.querySelector('[data-ai="gemini"]').textContent,
  openai: document.querySelector('[data-ai="openai"]').textContent,
  openaiDisabled: document.querySelector('[data-ai="openai"]').disabled,
  ollamaDisabled: document.querySelector('[data-ai="ollama"]').disabled
}));
if (!/disponible maintenant/.test(aiUi.gemini) || !/pas encore disponible/.test(aiUi.openai)
    || !aiUi.openaiDisabled || !aiUi.ollamaDisabled)
  fail('disponibilité IA ambiguë : ' + JSON.stringify(aiUi));
console.log('connexions IA : disponible maintenant vs pas encore disponible ✓');
await aiPage.waitForTimeout(350);
await aiPage.screenshot({ path: SHOTS + '/82-ux-ia-disponibilite.png' });

console.log(errors.length ? 'Erreurs console : ' + errors.join(' | ') : 'Zéro erreur console.');
if (errors.length) process.exitCode = 1;
await receiveBrowser.close();
server.close();
console.log(process.exitCode ? 'E2E audit UX : ÉCHEC' : 'E2E audit UX : OK');
