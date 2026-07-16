/* ============================================================
   OpenContact — interface · « Connexions » (messagerie, puis IA)
   Une seule feuille, ouverte depuis « Moi ». Deux groupes :
   MESSAGERIE (Gmail, Outlook) — l'adresse d'envoi est toujours
   visible ; états connecté / expiré / non connecté. Le groupe IA
   arrive avec les connexions IA. Tout ici exige le profil
   protégé (D9) : les jetons vivent sous coffre, et l'ouverture
   re-demande le code. L'OAuth se fait en popup vers oauth.html,
   qui renvoie l'URL par postMessage — même origine seulement.
   ============================================================ */
import { MAIL_CLIENTS, authUrl, parseCallback, pkcePair,
         exchangeOutlookCode, refreshOutlook, whoAmI } from '../engine/mailer.js';
import { MAIL_KEY, kvGet, kvSet } from '../engine/storage.js';
import { esc } from '../engine/utils.js';
import { S, bus, logJ } from './state.js';
import { ic, btn, toast, openSheet, confirmSheet } from './dom.js';
import { isProtected, openProtectFlow, requireCode } from './verrou.js';

const PROVIDERS = [
  { id: 'gmail', label: 'Gmail' },
  { id: 'outlook', label: 'Outlook / Hotmail' }
];
let mail = null;    /* { gmail:{token,exp,refresh?,email}, outlook:{…}, clients:{} } */

export async function loadMail(){
  try { mail = JSON.parse(await kvGet(MAIL_KEY) || 'null') || {}; }
  catch (e) { mail = {}; }
  return mail;
}
const saveMail = () => kvSet(MAIL_KEY, JSON.stringify(mail || {}));
const acct = p => (mail && mail[p]) || null;
const expired = a => !a.exp || a.exp <= Date.now() + 60000;

/* le compte utilisable pour « Envoyer » — le premier connecté */
export function mailAccount(){
  for (const p of PROVIDERS){
    const a = acct(p.id);
    if (a && a.token) return { provider: p.id, email: a.email || '' };
  }
  return null;
}
/* un jeton frais — rafraîchit Outlook en silence, lève `expire` sinon */
export async function freshToken(provider){
  const a = acct(provider);
  if (!a || !a.token) throw new Error('expire');
  if (!expired(a)) return a.token;
  if (provider === 'outlook' && a.refresh){
    const clientId = clientOf('outlook');
    const j = await refreshOutlook({ clientId, refresh: a.refresh }).catch(() => null);
    if (j){
      Object.assign(a, { token: j.access_token, refresh: j.refresh_token || a.refresh,
        exp: Date.now() + (j.expires_in || 3600) * 1000 });
      await saveMail();
      return a.token;
    }
  }
  throw new Error('expire');
}
export function mailStateLabel(){
  const list = PROVIDERS.map(p => ({ p, a: acct(p.id) })).filter(x => x.a && x.a.token);
  if (!list.length) return 'aucune';
  if (list.length === 1) return list[0].p.label + ' — ' + (list[0].a.email || 'connecté');
  return list.length + ' connectées';
}
const clientOf = p => (mail && mail.clients && mail.clients[p]) || MAIL_CLIENTS[p] || '';
const redirectUri = () => new URL('oauth.html', location.href.split(/[?#]/)[0]).href;

/* ---------- le parcours de connexion (popup + postMessage) ---------- */
function waitCallback(state){
  return new Promise((res, rej) => {
    const to = setTimeout(() => { off(); rej(new Error('temps')); }, 180000);
    const onMsg = e => {
      if (e.origin !== location.origin || !e.data || e.data.oc !== 'oauth') return;
      const p = parseCallback(e.data.url);
      if (p.state !== state) return;
      off();
      p.error ? rej(new Error('refus')) : res(p);
    };
    const off = () => { clearTimeout(to); window.removeEventListener('message', onMsg); };
    window.addEventListener('message', onMsg);
  });
}
async function connect(provider, rerender){
  const clientId = clientOf(provider);
  if (!clientId){ askClientId(provider, rerender); return; }
  const state = Math.random().toString(36).slice(2);
  const pk = provider === 'outlook' ? await pkcePair() : null;
  const url = authUrl(provider, clientId, redirectUri(), { state, challenge: pk && pk.challenge });
  const win = window.open(url, 'oc-oauth', 'width=480,height=640');
  if (!win){ toast('Popup bloquée — autorise-la pour te connecter.'); return; }
  try {
    const cb = await waitCallback(state);
    let token, exp, refresh = '';
    if (provider === 'gmail'){
      token = cb.access_token;
      exp = Date.now() + (Number(cb.expires_in) || 3600) * 1000;
    } else {
      const j = await exchangeOutlookCode({ clientId, redirectUri: redirectUri(), code: cb.code, verifier: pk.verifier });
      token = j.access_token;
      refresh = j.refresh_token || '';
      exp = Date.now() + (j.expires_in || 3600) * 1000;
    }
    if (!token) throw new Error('refus');
    const email = await whoAmI(provider, token).catch(() => '');
    mail[provider] = { token, exp, refresh, email };
    await saveMail();
    logJ('Messagerie connectée : ' + provider + (email ? ' (' + email + ')' : ''));
    toast('Connecté ✓' + (email ? ' — ' + email : ''));
  } catch (e) {
    try { win.close(); } catch (x) {}
    if (e.message !== 'refus') toast('Connexion interrompue — rien n’a changé.');
  }
  rerender();
  bus.refresh();
}
/* pas d'identifiant d'application déclaré : l'expliquer sans jargon,
   et laisser l'option avancée (coller le sien) pour tester */
function askClientId(provider, rerender){
  const sh = openSheet({ title: 'Bientôt disponible', icon: 'mail' });
  sh.body.innerHTML =
    `<p class="pd" style="margin:0 0 10px">La connexion ${provider === 'gmail' ? 'Google' : 'Microsoft'} sera ouverte quand l’application aura été déclarée chez le fournisseur. En attendant, « Ouvrir dans Mail » marche toujours.</p>
     <details class="pcard pcard-details"><summary><h3>${ic('settings-2', 'ic-14')} Option avancée</h3></summary>
       <div class="field"><label for="cxId">Identifiant d’application OAuth (client public)</label>
         <input id="cxId" autocomplete="off" placeholder="…apps.googleusercontent.com / UUID Azure">
         <p class="hint">Pour qui déclare sa propre app — l’identifiant n’est pas un secret.</p></div>
       <button class="btn btn-sm" id="cxSave">Enregistrer</button>
     </details>`;
  sh.body.querySelector('#cxSave').addEventListener('click', async () => {
    const v = sh.body.querySelector('#cxId').value.trim();
    if (!v) return;
    mail.clients = mail.clients || {};
    mail.clients[provider] = v;
    await saveMail();
    sh.close();
    toast('Enregistré — tu peux te connecter.');
    rerender();
  });
}

/* ---------- la feuille ---------- */
export async function openConnexions(){
  if (!isProtected()){
    const okv = await confirmSheet({ title: 'Protéger d’abord', icon: 'lock', okLabel: 'Protéger',
      msg: 'Les connexions gardent des accès à ta messagerie : elles exigent le verrouillage. Deux minutes, une seule fois.' });
    if (okv) openProtectFlow();
    return;
  }
  if (!await requireCode('Ton code, pour les connexions')) return;
  const sh = openSheet({ title: 'Connexions', icon: 'zap' });
  const render = () => {
    sh.body.innerHTML =
      `<div class="lbl-row"><label>Messagerie</label></div>
       ${PROVIDERS.map(p => {
         const a = acct(p.id);
         const on = a && a.token;
         const exp = on && expired(a) && !(p.id === 'outlook' && a.refresh);
         return `<div class="ec-row">
           <div class="ec-row-m"><b>${ic('mail', 'ic-14')} ${p.label}</b>
             <span class="ec-sub${exp ? ' cx-warn' : ''}">${on ? (exp ? 'expiré — reconnecte-toi' : esc(a.email || 'connecté')) : 'non connecté'}</span></div>
           ${on
             ? `${exp ? `<button class="btn btn-sm" data-cx="${p.id}">Reconnecter</button>` : ''}
                <button class="btn btn-sm" data-off="${p.id}">Déconnecter</button>`
             : `<button class="btn btn-sm" data-cx="${p.id}">Connecter</button>`}
         </div>`;
       }).join('')}
       <div class="lbl-row" style="margin-top:14px"><label>IA</label></div>
       <p class="hint" style="margin:2px 0 0">Arrive bientôt — rédaction et analyse, avec ta clé ou ton ordinateur.</p>
       <p class="hint" style="margin-top:14px">${ic('lock', 'ic-14')} Tes accès restent chiffrés sur tes appareils. Rien ne passe par un serveur OpenContact.</p>`;
    sh.body.querySelectorAll('[data-cx]').forEach(b =>
      b.addEventListener('click', () => connect(b.dataset.cx, render)));
    sh.body.querySelectorAll('[data-off]').forEach(b =>
      b.addEventListener('click', async () => {
        const okv = await confirmSheet({ title: 'Déconnecter ?', okLabel: 'Déconnecter', danger: true,
          msg: 'L’accès est retiré de cet appareil. Ton compte mail n’est pas touché.' });
        if (!okv) return;
        delete mail[b.dataset.off];
        await saveMail();
        logJ('Messagerie déconnectée : ' + b.dataset.off);
        render();
        bus.refresh();
      }));
  };
  render();
}
