/* ============================================================
   OpenContact — interface · le verrouillage (profil protégé)
   Le seul écran vraiment nouveau du chantier : plein écran,
   pavé au pouce (mobile) / clavier (ordinateur), biométrie en
   accélérateur optionnel, « Code oublié ? » vers la phrase de
   secours. La création est un parcours en feuille : une décision
   par écran — code, phrase écrite sur papier, sauvegarde chiffrée
   bloquante (D15). Verrouillage auto : 5 min mobile / 15 min
   ordinateur (D6) — l'interface se voile, la clé reste attachée :
   la sync et les gestes déjà validés continuent.
   ============================================================ */
import { esc, todayISO } from '../engine/utils.js';
import { bytesToB64, b64ToBytes, encryptOC2 } from '../engine/crypto.js';
import { fullPayload } from '../engine/exchange.js';
import { PIN_LEN, makeVaultPhrase, phraseUnknownWords,
         createVault, unlockWithPin, unlockWithPhrase, unlockWithPrf,
         setPin, addPrfWrap, removePrfWrap,
         rotateVaultResumable, prevKeyOf, clearPrev } from '../engine/vault.js';
import { VAULT_KEY, kvGet, kvSet, kvDel,
         vaultAttach, vaultDetach, vaultSealAll, vaultOpenAll, vaultReseal } from '../engine/storage.js';
import { ensureRing, recoverRing } from './synclive.js';
import { S, bus, logJ } from './state.js';
import { el, ic, btn, toast, openSheet, confirmSheet } from './dom.js';

let meta = null;          /* métadonnée oc_vault_v1 (null = non protégé) */
let lockEl = null;        /* l'écran verrouillé, quand il est affiché */
let lastTouch = Date.now();
let idleTimer = null;

export const isProtected = () => !!meta;
export const isLocked = () => !!lockEl;

const saveMeta = () => kvSet(VAULT_KEY, JSON.stringify(meta));
const isDesktop = () => matchMedia('(min-width:901px)').matches;
const IDLE_MS = () => (isDesktop() ? 15 : 5) * 60000;

/* ---------- pavé de saisie du code — réutilisé partout ----------
   root reçoit les points + les touches ; onFull(code) est appelé à
   6 chiffres. L'api permet d'effacer, de désactiver, de secouer. */
function padUI(root, onFull, opts){
  opts = opts || {};
  let code = '';
  let off = false;
  root.innerHTML =
    `<div class="lock-dots" role="status" aria-label="Code">${
      Array.from({ length: PIN_LEN }, () => '<span class="dot"></span>').join('')}</div>
     <div class="lock-pad">${
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button class="pad-k" data-d="${d}">${d}</button>`).join('')}
      ${opts.bio ? `<button class="pad-k pad-side" data-bio aria-label="Déverrouiller par empreinte">${ic('shield', 'ic-20')}</button>` : '<span></span>'}
      <button class="pad-k" data-d="0">0</button>
      <button class="pad-k pad-side" data-back aria-label="Effacer">${ic('arrow-left', 'ic-20')}</button>
     </div>
     <p class="lock-msg" role="alert"></p>`;
  const dots = Array.from(root.querySelectorAll('.dot'));
  const msg = root.querySelector('.lock-msg');
  const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < code.length));
  const push = d => {
    if (off || code.length >= PIN_LEN) return;
    code += d;
    msg.textContent = '';
    paint();
    if (code.length === PIN_LEN){ const c = code; setTimeout(() => onFull(c), 60); }
  };
  root.addEventListener('click', e => {
    const k = e.target.closest('.pad-k');
    if (!k) return;
    if (k.dataset.d != null) push(k.dataset.d);
    else if (k.hasAttribute('data-back')){ code = code.slice(0, -1); paint(); }
    else if (k.hasAttribute('data-bio') && opts.onBio) opts.onBio();
  });
  const api = {
    clear(){ code = ''; paint(); },
    say(t){ msg.textContent = t || ''; },
    shake(t){
      api.clear();
      api.say(t);
      const z = root.querySelector('.lock-dots');
      z.classList.remove('lock-err');
      void z.offsetWidth;
      z.classList.add('lock-err');
    },
    disable(v){ off = !!v; root.classList.toggle('pad-off', off); },
    key(e){          /* saisie clavier (ordinateur) */
      if (/^[0-9]$/.test(e.key)){ e.preventDefault(); push(e.key); }
      else if (e.key === 'Backspace'){ e.preventDefault(); code = code.slice(0, -1); paint(); }
    }
  };
  return api;
}

/* ---------- délai progressif après échecs (persiste au rechargement) */
function failDelay(n){
  if (n < 5) return 0;
  return [30, 60, 300][Math.min(n - 5, 2)] * 1000;
}
async function registerFail(){
  meta.guard = meta.guard || { n: 0, until: 0 };
  meta.guard.n++;
  const d = failDelay(meta.guard.n);
  if (d) meta.guard.until = Date.now() + d;
  await saveMeta();
}
async function clearFails(){
  if (meta.guard){ delete meta.guard; await saveMeta(); }
}

/* ---------- l'écran verrouillé ---------- */
function showLock(){
  return new Promise(resolve => {
    lockEl = el(
      `<div class="lock" role="dialog" aria-modal="true" aria-label="OpenContact est verrouillé">
         <div class="lock-in">
           <div class="lock-title">OPEN-CONTACT</div>
           <div class="lock-state">Verrouillé</div>
           <div class="lock-body"></div>
           <button class="linklike" id="lkForgot">Code oublié ?</button>
         </div>
       </div>`);
    document.body.append(lockEl);
    const hasBio = !!(meta.wraps && meta.wraps.prf) && !!navigator.credentials;
    const done = un => {
      document.removeEventListener('keydown', onKey, true);
      clearInterval(waitTimer);
      lockEl.remove();
      lockEl = null;
      lastTouch = Date.now();
      resolve(un);
    };
    let busy = false;          /* une vérification est en cours (PBKDF2 ~1 s) */
    const pad = padUI(lockEl.querySelector('.lock-body'), async code => {
      busy = true;
      pad.disable(true);
      try {
        const un = await unlockWithPin(meta, code);
        await clearFails();
        done(un);
      } catch (e) {
        busy = false;
        await registerFail();
        refreshWait();
        if (!(meta.guard && meta.guard.until > Date.now())) pad.shake('Ce n’est pas ça.');
      }
    }, {
      bio: hasBio,
      onBio: () => tryBioUnlock().then(un => { if (un){ clearFails(); done(un); } })
    });
    /* délai après échecs répétés : compte à rebours sobre */
    const refreshWait = () => {
      if (busy) return;
      const until = (meta.guard && meta.guard.until) || 0;
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left > 0){
        pad.disable(true);
        pad.say('Réessaie dans ' + (left > 90 ? Math.ceil(left / 60) + ' min' : left + ' s') + '.');
      } else {
        pad.disable(false);
        if (until) pad.say('');
      }
    };
    const waitTimer = setInterval(refreshWait, 1000);
    refreshWait();
    const onKey = e => {
      if (document.querySelector('.overlay')) return;   /* une feuille est ouverte au-dessus */
      pad.key(e);
    };
    document.addEventListener('keydown', onKey, true);
    lockEl.querySelector('#lkForgot').addEventListener('click', () =>
      openRecovery(un => done(un)));
    /* biométrie tentée d'office à l'ouverture */
    if (hasBio) tryBioUnlock().then(un => { if (un && lockEl){ clearFails(); done(un); } }).catch(() => {});
  });
}

/* ---------- Code oublié ? — la récupération d'urgence (D7) ----------
   La phrase prouvée : cet appareil devient l'appareil principal,
   l'ancien est écarté, code ET phrase renouvelés, données re-scellées
   sous une nouvelle clé, sauvegarde chiffrée obligatoire avant la fin.
   Honnêteté : les anciennes copies déjà exportées restent ouvrables
   avec l'ancienne phrase. */
function openRecovery(onUnlocked){
  const sh = openSheet({ title: 'Code oublié', icon: 'lock', focus: '#rcPhrase',
    guard: () => true });
  const q = s => sh.body.querySelector(s);
  let oldPhrase = '', un = null, newPin = '', newPhrase = '';

  const stepPhrase = () => {
    sh.body.innerHTML =
      `<div class="field"><label for="rcPhrase">Ta phrase de secours</label>
         <textarea id="rcPhrase" rows="3" autocapitalize="none" autocomplete="off"
           placeholder="Les 12 mots, dans l’ordre, séparés par des espaces"></textarea>
         <p class="hint" id="rcHint">Celle que tu as écrite sur papier en protégeant tes données.</p></div>`;
    sh.setFoot([btn('Vérifier', 'btn-primary', async () => {
      const phrase = q('#rcPhrase').value;
      const bad = phraseUnknownWords(phrase);
      const hint = q('#rcHint');
      if (bad.length){
        hint.textContent = 'Mot inconnu : « ' + bad[0] + ' » — vérifie l’orthographe.';
        hint.classList.add('warn');
        return;
      }
      try { un = await unlockWithPhrase(meta, phrase); }
      catch (e) {
        hint.textContent = 'Ce n’est pas la bonne phrase. Vérifie l’ordre des mots.';
        hint.classList.add('warn');
        return;
      }
      oldPhrase = phrase;
      stepAnnounce();
    })]);
  };

  const stepAnnounce = () => {
    sh.setTitle('Récupération');
    sh.body.innerHTML =
      `<div class="pick-list">
         <div class="lk-why">${ic('switch', 'ic-14')} <span>Cet appareil devient ton appareil principal. L’ancien est écarté.</span></div>
         <div class="lk-why">${ic('lock', 'ic-14')} <span>Ton code et ta phrase sont renouvelés.</span></div>
         <div class="lk-why">${ic('save', 'ic-14')} <span>Une nouvelle sauvegarde chiffrée termine le parcours.</span></div>
       </div>
       <p class="hint">Tes anciennes sauvegardes s’ouvrent toujours avec l’ancienne phrase — détruis celles que tu ne veux plus.</p>`;
    sh.setFoot([btn('Continuer', 'btn-primary', stepNewPin)]);
  };

  const stepNewPin = () => {
    sh.setTitle('Nouveau code');
    sh.body.innerHTML = '<div id="rcPad"></div>';
    sh.setFoot(null);
    newCodePad(q('#rcPad'), code => {
      newPin = code;
      newPhrase = makeVaultPhrase();
      phraseCeremony(sh, newPhrase, doRotate);
    });
  };

  const doRotate = async () => {
    sh.setTitle('Renouvellement…');
    sh.body.innerHTML = '<p class="hint" style="margin:12px 0">Nouvelles clés, données re-scellées — quelques secondes.</p>';
    sh.setFoot(null);
    /* ordre vital : la nouvelle métadonnée D'ABORD (elle embarque
       l'ancienne clé scellée sous la nouvelle — `prev`), le
       re-scellement ensuite. Interrompu ici = repris au prochain
       déverrouillage, sans rien perdre (voir initVerrou). */
    const rot = await rotateVaultResumable(meta, { phrase: oldPhrase }, newPin, newPhrase);
    meta = rot.meta;
    await saveMeta();
    await vaultReseal(rot.oldKey, rot.key);
    meta = clearPrev(meta);
    await saveMeta();
    un = { key: rot.key, gen: meta.gen };
    await recoverRing(oldPhrase, newPhrase).catch(() => {});
    logJ('Récupération d’urgence : protection et phrase renouvelées');
    backupCeremony(sh, newPhrase, finish,
      'Presque fini : une nouvelle sauvegarde chiffrée, à garder ailleurs.');
  };

  const finish = () => {
    sh.close(null, true);
    toast('Récupéré ✓ — cet appareil est ton appareil principal.');
    oldPhrase = newPhrase = newPin = '';
    onUnlocked(un);
  };

  stepPhrase();
}

/* codes refusés : suites et répétitions évidentes */
export function isWeakPin(code){
  if (/^(\d)\1+$/.test(code)) return true;
  const asc = '01234567890123456789', desc = '98765432109876543210';
  return asc.includes(code) || desc.includes(code);
}

/* ---------- cérémonies communes ---------- */
/* choisir un code : saisie + confirmation, codes triviaux refusés */
function newCodePad(root, onDone){
  let first = '';
  const pad = padUI(root, code => {
    if (!first){
      if (isWeakPin(code)){ pad.shake('Trop facile à deviner.'); return; }
      first = code;
      pad.clear();
      pad.say('Encore une fois, pour confirmer.');
      return;
    }
    if (code !== first){ first = ''; pad.shake('Pas le même code — recommence.'); return; }
    onDone(code);
  });
  return pad;
}
/* la phrase : affichée, écrite sur papier, 2 mots re-vérifiés */
function phraseCeremony(sh, phrase, onOk){
  const q = s => sh.body.querySelector(s);
  const show = () => {
    sh.setTitle('Ta phrase de secours');
    sh.body.innerHTML =
      `<ol class="phrase-grid">${phrase.split(' ').map(w => `<li>${esc(w)}</li>`).join('')}</ol>
       <p class="hint warn">Écris-la sur papier. C’est la seule issue si tu oublies ton code.</p>
       <p class="hint">Rien à voir avec ta phrase de liaison d’appareils.</p>`;
    sh.setFoot([btn('Je l’ai écrite', 'btn-primary', verify)]);
  };
  const verify = () => {
    const words = phrase.split(' ');
    const a = Math.floor(Math.random() * 6), b = 6 + Math.floor(Math.random() * 6);
    sh.setTitle('Vérifions');
    sh.body.innerHTML =
      `<div class="grid2">
         <div class="field"><label for="vw1">Mot n°${a + 1}</label>
           <input id="vw1" autocapitalize="none" autocomplete="off"></div>
         <div class="field"><label for="vw2">Mot n°${b + 1}</label>
           <input id="vw2" autocapitalize="none" autocomplete="off"></div>
       </div>
       <p class="hint" id="vwHint">Recopie ces deux mots depuis ton papier.</p>`;
    sh.setFoot([
      btn('Revoir la phrase', 'btn-ghost', show),
      btn('Continuer', 'btn-primary', () => {
        const w1 = q('#vw1').value.trim().toLowerCase();
        const w2 = q('#vw2').value.trim().toLowerCase();
        if (w1 !== words[a] || w2 !== words[b]){
          q('#vwHint').textContent = 'Ce n’est pas ça — reprends ton papier.';
          q('#vwHint').classList.add('warn');
          return;
        }
        onOk();
      })
    ]);
  };
  show();
}
/* la sauvegarde chiffrée bloquante (D15/D7) — chiffrée avec la phrase */
function backupCeremony(sh, phrase, onOk, introTxt){
  sh.setTitle('Ta sauvegarde');
  sh.body.innerHTML =
    `<p class="pd" style="margin:0 0 10px">${introTxt || 'Dernière étape : une sauvegarde chiffrée de tout, à garder ailleurs (clé USB, autre disque).'}</p>
     <p class="hint">Chiffrée avec ta phrase de secours — elle seule l’ouvre.</p>`;
  const bDl = btn('Télécharger la sauvegarde', 'btn-primary', async () => {
    const txt = await encryptOC2(fullPayload(S.companies, S.profile, S.orphans, S.tombs), phrase);
    const A = document.createElement('a');
    A.href = URL.createObjectURL(new Blob([txt], { type: 'application/octet-stream' }));
    A.download = 'opencontact-sauvegarde-' + todayISO() + '.oc';
    document.body.append(A);
    A.click();
    A.remove();
    setTimeout(() => URL.revokeObjectURL(A.href), 4000);
    bEnd.disabled = false;
    bEnd.classList.add('btn-primary');
    bDl.classList.remove('btn-primary');
  }, 'download');
  const bEnd = btn('Terminer', '', onOk);
  bEnd.disabled = true;
  sh.setFoot([bDl, bEnd]);
}

/* ---------- biométrie / passkey (accélérateur optionnel, P1-3) ---------- */
export function bioAvailable(){
  return !!(window.PublicKeyCredential && navigator.credentials &&
            window.isSecureContext);
}
export const bioEnrolled = () => !!(meta && meta.wraps && meta.wraps.prf);
async function tryBioUnlock(){
  const w = meta.wraps && meta.wraps.prf;
  if (!w || !w.e) return null;
  try {
    const cred = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: b64ToBytes(w.id) }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: b64ToBytes(w.e) } } }
    } });
    const r = cred.getClientExtensionResults();
    const secret = r.prf && r.prf.results && r.prf.results.first;
    if (!secret) return null;
    return await unlockWithPrf(meta, new Uint8Array(secret));
  } catch (e) { return null; }
}
export async function enrollBio(pin){
  const cred = await navigator.credentials.create({ publicKey: {
    rp: { name: 'OpenContact' },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'opencontact', displayName: 'OpenContact' },
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
    extensions: { prf: {} }
  } });
  const evalIn = crypto.getRandomValues(new Uint8Array(32));
  const got = await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ type: 'public-key', id: cred.rawId }],
    userVerification: 'required',
    extensions: { prf: { eval: { first: evalIn } } }
  } });
  const r = got.getClientExtensionResults();
  const secret = r.prf && r.prf.results && r.prf.results.first;
  if (!secret) throw new Error('prf');
  meta = await addPrfWrap(meta, { pin }, new Uint8Array(secret), bytesToB64(new Uint8Array(cred.rawId)));
  meta.wraps.prf.e = bytesToB64(evalIn);
  await saveMeta();
}
export async function dropBio(){
  meta = removePrfWrap(meta);
  await saveMeta();
}

/* ---------- démarrage & verrouillage auto ---------- */
export async function initVerrou(){
  const raw = await kvGet(VAULT_KEY);
  if (!raw){ meta = null; return false; }
  try { meta = JSON.parse(raw); } catch (e) { meta = null; return false; }
  const un = await showLock();
  vaultAttach(un.key);
  if (meta.prev){
    /* rotation interrompue : finir le re-scellement, puis solder */
    try {
      const pk = await prevKeyOf(meta, un.key);
      if (pk){
        await vaultReseal(pk, un.key);
        meta = clearPrev(meta);
        await saveMeta();
        logJ('Rotation du coffre reprise et terminée après interruption');
      }
    } catch (e) {}
  }
  vaultSealAll().catch(() => {});     /* migration : sceller l'existant (idempotent) */
  startIdleWatch();
  return true;
}
export function lockNow(){
  if (!meta || lockEl) return;
  /* la clé RESTE attachée : la sync et une campagne validée continuent —
     le verrou protège l'écran, le coffre protège le disque */
  showLock().then(() => bus.refresh());
}
function startIdleWatch(){
  const touch = () => { lastTouch = Date.now(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
    document.addEventListener(ev, touch, { passive: true, capture: true }));
  clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    if (meta && !lockEl && Date.now() - lastTouch > IDLE_MS()) lockNow();
  }, 20000);
}

/* ---------- re-authentification des gestes sensibles (P1-2) ----------
   Résout true si le code est re-prouvé (ou si rien n'est protégé). */
export function requireCode(title){
  if (!meta) return Promise.resolve(true);
  return new Promise(resolve => {
    let okv = false;
    const sh = openSheet({
      title: title || 'Ton code', icon: 'lock', className: 'modal-confirm',
      onClose: () => resolve(okv)
    });
    sh.body.innerHTML = '<div id="rqPad"></div>';
    const pad = padUI(sh.body.querySelector('#rqPad'), async code => {
      pad.disable(true);
      try {
        await unlockWithPin(meta, code);
        okv = true;
        sh.close(null, true);
      } catch (e) { pad.disable(false); pad.shake('Ce n’est pas ça.'); }
    });
  });
}

/* ---------- création : « Protéger tes données » ---------- */
export function openProtectFlow(){
  if (meta){ openManageSheet(); return; }
  let pin = '', phrase = '', saved = false;
  const sh = openSheet({
    title: 'Protéger tes données', icon: 'lock', focus: '.x',
    guard: () => {
      if (saved) return true;
      if (!pin) return true;
      return confirmSheet({ title: 'Abandonner ?', okLabel: 'Abandonner',
        msg: 'Rien n’est encore protégé — tu pourras recommencer quand tu veux.' });
    }
  });
  const q = s => sh.body.querySelector(s);

  const stepIntro = () => {
    sh.body.innerHTML =
      `<div class="pick-list">
         <div class="lk-why">${ic('lock', 'ic-14')} <span>Un code pour ouvrir l’app.</span></div>
         <div class="lk-why">${ic('shield', 'ic-14')} <span>Tes données et tes secrets chiffrés ici.</span></div>
         <div class="lk-why">${ic('switch', 'ic-14')} <span>Tes appareils sous contrôle.</span></div>
       </div>
       <p class="hint">Optionnel — l’app reste la même sans. Obligatoire pour connecter une messagerie ou une IA.</p>`;
    sh.setFoot([btn('Choisir mon code', 'btn-primary', stepPin)]);
  };

  const stepPin = () => {
    sh.setTitle('Ton code');
    sh.body.innerHTML = `<p class="hint" style="margin:0 0 10px">Six chiffres — demandés à chaque ouverture.</p><div id="lkPad"></div>`;
    sh.setFoot(null);
    newCodePad(q('#lkPad'), code => {
      pin = code;
      phrase = phrase || makeVaultPhrase();
      phraseCeremony(sh, phrase, () => backupCeremony(sh, phrase, finish));
    });
  };

  const finish = async () => {
    const made = await createVault(pin, phrase);
    meta = made.meta;
    await saveMeta();
    vaultAttach(made.key);
    await vaultSealAll();
    await ensureRing(phrase).catch(() => {});   /* cet appareil devient le principal */
    startIdleWatch();
    saved = true;
    logJ('Données protégées (verrouillage activé)');
    sh.close(null, true);
    bus.refresh();
    toast('Protégé ✓ — cet appareil est ton appareil principal.');
    /* biométrie : accélérateur optionnel, proposé une fois */
    if (bioAvailable()){
      const okv = await confirmSheet({ title: 'Déverrouiller plus vite ?', icon: 'shield',
        okLabel: 'Activer', cancelLabel: 'Plus tard',
        msg: 'Empreinte ou visage, si ton appareil le propose. Le code reste le secours.' });
      if (okv){
        try { await enrollBio(pin); toast('Activé ✓'); }
        catch (e) { toast('Pas disponible ici — le code suffit.'); }
      }
    }
    pin = phrase = '';
  };

  stepIntro();
}

/* ---------- gestion (depuis « Moi ») ---------- */
export function openManageSheet(){
  const sh = openSheet({ title: 'Verrouillage', icon: 'lock' });
  const render = () => {
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 10px">Protégé — se verrouille seul après ${isDesktop() ? '15' : '5'} min d’inactivité.</p>
       <div class="pick-list">
         <button class="pick" id="vgLock"><b>Verrouiller maintenant</b></button>
         <button class="pick" id="vgPin"><b>Changer mon code</b></button>
         ${bioAvailable() ? `<button class="pick" id="vgBio"><b>${bioEnrolled() ? 'Retirer' : 'Activer'} l’empreinte / le visage</b><span>le code reste le secours</span></button>` : ''}
       </div>
       <button class="linklike" id="vgOff" style="margin-top:14px;color:var(--red)">Ne plus protéger…</button>`;
    const q = s => sh.body.querySelector(s);
    q('#vgLock').addEventListener('click', () => { sh.close(); lockNow(); });
    q('#vgPin').addEventListener('click', changePin);
    q('#vgBio')?.addEventListener('click', async () => {
      if (bioEnrolled()){ await dropBio(); toast('Retiré.'); render(); return; }
      askCurrentPin('Ton code actuel', async pin => {
        try { await enrollBio(pin); toast('Activé ✓'); }
        catch (e) { toast('Pas disponible ici — le code suffit.'); }
        render();
      });
    });
    q('#vgOff').addEventListener('click', async () => {
      const sure = await confirmSheet({ title: 'Ne plus protéger ?', danger: true, okLabel: 'Ne plus protéger', icon: 'lock',
        msg: 'Tes données redeviennent lisibles sur cet appareil, et les connexions qui exigent la protection seront retirées.' });
      if (!sure) return;
      askCurrentPin('Ton code, pour confirmer', async () => {
        await vaultOpenAll();          /* tout ré-écrire en clair d'abord */
        await kvDel(VAULT_KEY);        /* puis seulement retirer la métadonnée */
        vaultDetach();
        meta = null;
        logJ('Verrouillage retiré');
        sh.close(null, true);
        bus.refresh();
        toast('Ce n’est plus protégé.');
      });
    });
  };
  const askCurrentPin = (title, then) => {
    const s2 = openSheet({ title, icon: 'lock', className: 'modal-confirm' });
    s2.body.innerHTML = '<div id="cpPad"></div>';
    const pad = padUI(s2.body.querySelector('#cpPad'), async code => {
      pad.disable(true);
      try { await unlockWithPin(meta, code); s2.close(null, true); then(code); }
      catch (e) { pad.disable(false); pad.shake('Ce n’est pas ça.'); }
    });
  };
  const changePin = () => askCurrentPin('Ton code actuel', cur => {
    const s2 = openSheet({ title: 'Nouveau code', icon: 'lock', className: 'modal-confirm' });
    s2.body.innerHTML = '<div id="npPad"></div>';
    newCodePad(s2.body.querySelector('#npPad'), async code => {
      meta = await setPin(meta, { pin: cur }, code);
      await saveMeta();
      logJ('Code du verrouillage changé');
      s2.close(null, true);
      toast('Nouveau code enregistré ✓');
    });
  });
  render();
}

/* l'étiquette d'état pour la ligne de « Moi » */
export function verrouLabel(){
  return meta ? 'protégé — se verrouille seul' : 'non protégé';
}

/* commande « verrouiller » reçue de l'appareil principal (anneau) */
document.addEventListener('oc:ringlock', () => lockNow());
