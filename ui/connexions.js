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
import { AI_FAMILIES } from '../engine/ai.js';
import { MAIL_KEY, AI_KEY, kvGet, kvSet } from '../engine/storage.js';
import { esc } from '../engine/utils.js';
import { S, bus, logJ } from './state.js';
import { ic, btn, toast, openSheet, confirmSheet } from './dom.js';
import { isProtected, openProtectFlow, requireCode } from './verrou.js';

const PROVIDERS = [
  { id: 'gmail', label: 'Gmail' },
  { id: 'outlook', label: 'Outlook / Hotmail' }
];
let mail = null;    /* { gmail:{token,exp,refresh?,email}, outlook:{…}, clients:{} } */
let ai = null;      /* { provider, key, model } */

export async function loadMail(){
  try { mail = JSON.parse(await kvGet(MAIL_KEY) || 'null') || {}; }
  catch (e) { mail = {}; }
  try { ai = JSON.parse(await kvGet(AI_KEY) || 'null') || {}; }
  catch (e) { ai = {}; }
  return mail;
}
const saveMail = () => kvSet(MAIL_KEY, JSON.stringify(mail || {}));
const saveAi = () => kvSet(AI_KEY, JSON.stringify(ai || {}));

/* la connexion IA utilisable — clé navigateur (Claude, Gemini,
   OpenRouter) ou « via ton ordinateur » (Ollama, OpenAI, ChatGPT :
   le Compagnon fait l'appel, la clé ne fait que passer, chiffrée) */
export function aiConnection(){
  if (!ai || !ai.provider) return null;
  const fam = AI_FAMILIES[ai.provider];
  if (!fam) return null;
  if (fam.key && !ai.key) return null;
  return { provider: ai.provider, channel: fam.channel, key: ai.key || '', model: ai.model || '' };
}
export function aiStateLabel(){
  if (ai && ai.provider && AI_FAMILIES[ai.provider]){
    const fam = AI_FAMILIES[ai.provider];
    if (fam.key && !ai.key) return fam.label + ' — clé à coller';
    const modele = ai.model || (ai.provider === 'chatgpt' ? 'modèle de Codex' : 'modèle à choisir');
    return fam.label + ' · ' + modele;
  }
  return 'aucune';
}

/* un travail IA confié à l'ordinateur (texte ou liste de modèles) :
   demande courte sur le canal chiffré, suivi jusqu'au résultat,
   ANNULABLE — fermer la feuille abandonne vraiment (le Compagnon tue
   ou jette le travail). Mêmes codes d'erreur courts que le chemin
   navigateur, plus `compagnon` (pas associé) et `eteint`. */
async function companionIaJob(payload, opts){
  opts = opts || {};
  const { probeCompanion, companionCall } = await import('../engine/companion.js');
  const { loadCompanion } = await import('./compagnon.js');
  const assoc = await loadCompanion().catch(() => null);
  if (!assoc) throw new Error('compagnon');
  const found = await probeCompanion();
  if (!found) throw new Error('eteint');
  const jid = 'ia-' + Math.random().toString(36).slice(2, 10);
  let rep;
  try {
    rep = await companionCall(found.base, assoc.k, Object.assign({ t: 'ia-demarrer', jid }, payload));
  } catch (e) { throw new Error('eteint'); }
  if (!rep || rep.t !== 'ok') throw new Error((rep && rep.e) || 'echec');
  const abandonner = () => { companionCall(found.base, assoc.k, { t: 'ia-annuler', jid }).catch(() => {}); };
  const debut = Date.now();
  while (Date.now() - debut < 200000){
    await new Promise(r => setTimeout(r, 1200));
    if (opts.cancelled && opts.cancelled()){ abandonner(); throw new Error('annule'); }
    let et;
    try { et = await companionCall(found.base, assoc.k, { t: 'ia-etat', jid }); }
    catch (e) { throw new Error('eteint'); }
    if (!et || et.t !== 'ia' || et.etat === 'inconnue') throw new Error('echec');
    if (et.etat === 'fini') return et;
    if (et.etat === 'erreur') throw new Error(et.e || 'echec');
  }
  abandonner();
  throw new Error('indispo');
}
export async function aiCompleteViaCompanion(conn, prompt, opts){
  opts = opts || {};
  const et = await companionIaJob({ provider: conn.provider, key: conn.key || '',
    model: conn.model || '', prompt, system: opts.system || '' }, opts);
  /* même borne que le Compagnon (oc_coeur TEXTE_MAX) — ceinture locale */
  return String(et.texte || '').trim().slice(0, 20000);
}
export async function aiModelsViaCompanion(provider, key){
  const et = await companionIaJob({ op: 'modeles', provider, key: key || '' }, {});
  return Array.isArray(et.modeles) ? et.modeles : [];
}
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
       <div class="lbl-row" style="margin-top:14px"><label>IA <span class="lbl-soft">— aide à la rédaction</span></label></div>
       <div class="ec-row">
         <div class="ec-row-m"><b>${ic('sparkles', 'ic-14')} Assistant</b>
           <span class="ec-sub">${esc(aiStateLabel())}</span></div>
         <button class="btn btn-sm" id="cxAi">${aiConnection() ? 'Gérer' : 'Choisir'}</button>
       </div>
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
    sh.body.querySelector('#cxAi').addEventListener('click', () => openAiSheet(render));
  };
  render();
}

/* la feuille IA : chaque famille dit son chemin — « ici » (clé
   navigateur) ou « via ton ordinateur » (le Compagnon fait l'appel).
   Une décision à la fois ; couper reste possible d'un geste. */
function openAiSheet(after){
  const sh = openSheet({ title: 'Assistant IA', icon: 'sparkles' });
  const q = s => sh.body.querySelector(s);
  const render = () => {
    sh.setTitle('Assistant IA');
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 10px">L’IA propose un brouillon — tu le relis et tu décides. Sans elle, les modèles restent là.</p>
       <div class="pick-list">
         ${Object.keys(AI_FAMILIES).map(k => {
           const f = AI_FAMILIES[k];
           const on = ai && ai.provider === k;
           const voie = f.channel === 'companion'
             ? (f.key ? 'Clé API · via ton ordinateur'
               : (k === 'ollama' ? 'Local · via ton ordinateur' : 'Abonnement · via ton ordinateur'))
             : 'Clé API · ici';
           return `<button class="pick${on ? ' pick-on' : ''}" data-ai="${k}">
                     <b>${esc(f.label)}</b>
                     <span>${voie}${on ? ' · actif' : ''}</span>
                   </button>`;
         }).join('')}
       </div>
       ${ai && ai.provider ? `<button class="linklike" id="aiOff" style="margin-top:12px;color:var(--red)">Retirer ce choix</button>` : ''}`;
    sh.body.querySelectorAll('[data-ai]').forEach(b =>
      b.addEventListener('click', () => pick(b.dataset.ai)));
    q('#aiOff')?.addEventListener('click', async () => {
      ai = {};
      await saveAi();
      logJ('Assistant IA retiré');
      render();
      after && after();
      bus.refresh();
    });
  };
  /* choisir une famille = deux gestes au plus : la clé s'il en faut
     une, puis LE modèle — choisi dans la liste que le fournisseur
     sert VRAIMENT (aucun modèle codé en dur, aucun choix décoratif :
     ce qui est affiché est ce qui sera utilisé). Si la liste est
     injoignable, on le dit et on laisse taper le nom à la main. */
  const intro = k =>
    k === 'ollama' ? 'Ollama tourne sur ton ordinateur : rien ne sort, aucune clé, hors ligne une fois le modèle installé.'
    : k === 'chatgpt' ? 'Ton abonnement ChatGPT, par l’outil officiel Codex connecté sur ton ordinateur. Aucune clé à coller.'
    : AI_FAMILIES[k].channel === 'companion'
      ? 'Ta clé sert l’appel depuis ton ordinateur, puis s’oublie là-bas — elle n’y est jamais gardée.'
      : 'L’appel part d’ici, avec ta clé.';
  const enregistrer = async (k, key, model) => {
    ai = { provider: k, key, model };
    await saveAi();
    logJ('Assistant IA : ' + k + (model ? ' (' + model + ')' : ''));
    sh.setFoot(null);
    toast('Assistant prêt ✓');
    render();
    after && after();
    bus.refresh();
  };
  const pick = k => {
    const f = AI_FAMILIES[k];
    sh.setTitle(f.label);
    if (f.key) etapeCle(k, '');
    else etapeModeles(k, '');
  };
  const etapeCle = (k, erreur) => {
    sh.setTitle(AI_FAMILIES[k].label);
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 10px">${intro(k)}</p>
       <div class="field"><label for="aiKey">Ta clé ${esc(AI_FAMILIES[k].label)}</label>
         <input id="aiKey" type="password" autocomplete="off" value="${esc((ai && ai.provider === k && ai.key) || '')}">
         <p class="hint${erreur ? ' warn' : ''}">${erreur || 'Elle reste chiffrée ici — jamais dans un log ni un export.'}</p></div>`;
    sh.setFoot([
      btn('← Retour', 'btn-ghost', () => { sh.setFoot(null); render(); }),
      btn('Continuer', 'btn-primary', () => {
        const key = q('#aiKey').value.trim();
        if (!key){ toast('Colle ta clé, ou reviens en arrière.'); return; }
        etapeModeles(k, key);
      })
    ]);
  };
  const etapeModeles = async (k, key) => {
    const f = AI_FAMILIES[k];
    sh.setTitle('Modèle — ' + f.label);
    sh.body.innerHTML = `<p class="hint" style="margin:12px 0">${ic('clock', 'ic-14')} Je demande au fournisseur ses modèles…</p>`;
    sh.setFoot([btn('← Retour', 'btn-ghost', () => { sh.setFoot(null); f.key ? etapeCle(k, '') : render(); })]);
    let liste;
    try {
      liste = f.channel === 'companion'
        ? await aiModelsViaCompanion(k, key)
        : await (await import('../engine/ai.js')).aiListModels({ provider: k, key });
    } catch (e) {
      if (e.message === 'cle'){ etapeCle(k, 'Clé refusée — vérifie-la.'); return; }
      etapeLibre(k, key,
        e.message === 'compagnon' ? 'Associe d’abord le Compagnon (Mes appareils) — tu choisiras dans sa liste ensuite.'
        : e.message === 'eteint' ? 'Ton ordinateur est éteint — sa liste attendra. Tu peux taper un nom en attendant.'
        : e.message === 'runtime' ? 'Le moteur IA de ton ordinateur ne répond pas — sa liste attendra.'
        : 'La liste des modèles est injoignable pour l’instant.');
      return;
    }
    if (!liste.length){ etapeLibre(k, key, 'Le fournisseur n’a rendu aucun modèle.'); return; }
    /* « actuel » seulement si cette famille est vraiment celle en service */
    const actuel = ai && ai.provider === k ? (ai.model || '') : null;
    const entrees = (k === 'chatgpt' ? [{ id: '', nom: 'Celui réglé dans Codex' }] : []).concat(liste);
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 10px">La liste vient du fournisseur, à l’instant — choisis, c’est ce modèle qui écrira.</p>
       ${entrees.length > 12 ? `<div class="field"><input id="aiFiltre" autocomplete="off" placeholder="Filtrer…"></div>` : ''}
       <div class="pick-list" id="aiListe">
         ${entrees.map(m => `<button class="pick${m.id === actuel ? ' pick-on' : ''}" data-m="${esc(m.id)}">
             <b>${esc(m.id || m.nom)}</b><span>${esc(m.id && m.nom !== m.id ? m.nom : '')}${m.id === actuel ? ' · actuel' : ''}</span>
           </button>`).join('')}
       </div>`;
    sh.body.querySelectorAll('[data-m]').forEach(b =>
      b.addEventListener('click', () => enregistrer(k, key, b.dataset.m)));
    q('#aiFiltre')?.addEventListener('input', () => {
      const v = q('#aiFiltre').value.trim().toLowerCase();
      sh.body.querySelectorAll('[data-m]').forEach(b => {
        b.style.display = !v || b.textContent.toLowerCase().includes(v) ? '' : 'none';
      });
    });
    sh.setFoot([btn('← Retour', 'btn-ghost', () => { sh.setFoot(null); f.key ? etapeCle(k, '') : render(); })]);
  };
  /* la liste est injoignable : on le DIT, et le nom se tape à la main */
  const etapeLibre = (k, key, pourquoi) => {
    sh.setTitle('Modèle — ' + AI_FAMILIES[k].label);
    sh.body.innerHTML =
      `<p class="hint warn" style="margin:0 0 10px">${esc(pourquoi)}</p>
       <div class="field"><label for="aiModel">Nom du modèle${k === 'chatgpt' ? ' <span class="lbl-soft">— vide = celui réglé dans Codex</span>' : ''}</label>
         <input id="aiModel" autocomplete="off" value="${esc((ai && ai.provider === k && ai.model) || '')}"></div>`;
    sh.setFoot([
      btn('← Retour', 'btn-ghost', () => { sh.setFoot(null); render(); }),
      btn('Enregistrer', 'btn-primary', () => {
        const model = q('#aiModel').value.trim();
        if (!model && k !== 'chatgpt'){ toast('Il faut un modèle — ou réessaie la liste plus tard.'); return; }
        enregistrer(k, key, model);
      })
    ]);
  };
  render();
}
