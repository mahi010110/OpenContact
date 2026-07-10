/* ============================================================
   OpenContact — interface · le DIRECT (P2P, WebRTC via Trystero)
   Deux salles bien distinctes, jamais mélangées :
   · « Mes appareils » — une phrase de liaison PERSONNELLE ; tout
     circule (privé inclus) et le plus récent gagne (engine/sync).
     Chaque appareil s'annonce (id + petit nom) : la liste des
     appareils reliés se consulte, s'élague, et au-delà de
     DEVICES_MAX on conseille de changer la phrase.
   · « Salle de promo » — un mot de passe de GROUPE ; seules les
     fiches partageables circulent (sharePayload), avec le même
     aperçu avant fusion que par fichier.
   La signalisation passe par des relais publics (Nostr), les
   données voyagent chiffrées de pair à pair. Rien n'est stocké
   ailleurs que sur les appareils. La lib (58 Ko) est chargée
   paresseusement — zéro poids au démarrage.
   ============================================================ */
import { esc, uid } from '../engine/utils.js';
import { normalizeProfile } from '../engine/model.js';
import { sharePayload, fullPayload } from '../engine/exchange.js';
import { syncMerge } from '../engine/sync.js';
import { SYNC_KEY, RELAYS_KEY, DEVICE_KEY, DEVICES_KEY, PROMO_KEY,
         kvGet, kvSet } from '../engine/storage.js';
import { S, bus, isClosed, applySynced, saveProfile, logJ } from './state.js';
import { openSheet, confirmSheet, toast, btn, ic, showUndo } from './dom.js';
import { mergePreviewInto } from './recevoir.js';

let libP = null;
const loadLib = () => libP || (libP = import('../assets/vendor/trystero-nostr.min.js'));

async function sha256hex(s){
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}
/* la phrase ne sort jamais telle quelle : la salle porte un hash.
   Relais personnalisés possibles (oc_relays_v1) — utile si un
   établissement héberge le sien ou si les relais publics sont bloqués. */
async function openRoom(kind, phrase){
  const { joinRoom } = await loadLib();
  const id = kind + '-' + (await sha256hex('opencontact·' + kind + '·' + phrase)).slice(0, 24);
  const cfg = { appId: 'opencontact', password: phrase };
  try {
    const urls = JSON.parse(await kvGet(RELAYS_KEY) || 'null');
    if (Array.isArray(urls) && urls.length) cfg.relayConfig = { urls };
  } catch (e) {}
  return joinRoom(cfg, id);
}
/* phrase de liaison : 10 caractères sans ambiguïté, faciles à taper */
function makePhrase(){
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const u = crypto.getRandomValues(new Uint8Array(10));
  const c = i => abc[u[i] % abc.length];
  return [0, 1, 2, 3, 4].map(c).join('') + '-' + [5, 6, 7, 8, 9].map(c).join('');
}

/* ---------- identité de CET appareil (petit nom lisible) ---------- */
function guessName(){
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return os + (br ? ' · ' + br : '');
}
async function deviceSelf(){
  try {
    const d = JSON.parse(await kvGet(DEVICE_KEY) || 'null');
    if (d && d.id) return d;
  } catch (e) {}
  const d = { id: uid(), name: guessName() };
  await kvSet(DEVICE_KEY, JSON.stringify(d));
  return d;
}
async function loadDevices(){
  try { return JSON.parse(await kvGet(DEVICES_KEY) || '[]') || []; } catch (e) { return []; }
}
async function upsertDevice(id, name){
  const list = (await loadDevices()).filter(d => d && d.id && d.id !== id);
  list.unshift({ id, name: String(name || 'Appareil').slice(0, 40), seen: Date.now() });
  list.sort((a, b) => (b.seen || 0) - (a.seen || 0));
  await kvSet(DEVICES_KEY, JSON.stringify(list.slice(0, 12)));
}
async function removeDevice(id){
  const list = (await loadDevices()).filter(d => d.id !== id);
  await kvSet(DEVICES_KEY, JSON.stringify(list));
}
export const DEVICES_MAX = 5;
const agoLabel = t => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return 'à l’instant';
  if (m < 60) return 'il y a ' + m + ' min';
  const h = Math.round(m / 60);
  if (h < 24) return 'il y a ' + h + ' h';
  return 'il y a ' + Math.round(h / 24) + ' j';
};

/* ============ Mes appareils : sync complète, LWW ============ */
export function openAppareils(){
  let room = null;
  let peers = 0;
  let onChange = null;
  const leave = () => {
    if (onChange){ document.removeEventListener('oc:change', onChange); onChange = null; }
    if (room){ try { room.leave(); } catch (e) {} room = null; }
  };
  const sh = openSheet({ title: 'Mes appareils', icon: 'switch', onClose: leave });
  const q = s => sh.body.querySelector(s);

  const setStatus = txt => { const el = q('#syStatus'); if (el) el.innerHTML = txt; };

  /* la liste des appareils reliés : cet appareil + ceux déjà vus,
     élagable ; au-delà de DEVICES_MAX, le vrai remède est de changer
     la phrase — retirer de la liste n'empêche pas de revenir */
  async function renderDevs(){
    const box = q('#syDevs');
    if (!box) return;
    const self = await deviceSelf();
    const list = await loadDevices();
    box.innerHTML =
      `<div class="lbl-row" style="margin-bottom:6px"><label>Appareils reliés</label></div>
       <div class="dev-row"><b>${esc(self.name)}</b><span class="dev-sub">cet appareil</span></div>
       ${list.map(d =>
         `<div class="dev-row"><b>${esc(d.name)}</b><span class="dev-sub">${agoLabel(d.seen || 0)}</span>
            <button class="abtn abtn-sm" data-rm="${esc(d.id)}" aria-label="Retirer ${esc(d.name)}" title="Retirer">${ic('trash', 'ic-14')}</button>
          </div>`).join('')}
       ${1 + list.length > DEVICES_MAX
         ? `<p class="hint warn" style="margin-top:6px">Plus de ${DEVICES_MAX} appareils — change la phrase de liaison pour écarter ceux que tu ne reconnais pas.</p>`
         : ''}`;
    box.querySelectorAll('[data-rm]').forEach(b =>
      b.addEventListener('click', async () => {
        const d = list.find(x => x.id === b.dataset.rm);
        const ok = await confirmSheet({
          title: 'Retirer cet appareil ?', danger: true, okLabel: 'Retirer', icon: 'trash',
          msg: `<b>${esc(d ? d.name : 'Appareil')}</b> sort de la liste. Il connaît encore la phrase — pour l’écarter vraiment, change aussi la phrase de liaison.`
        });
        if (!ok) return;
        await removeDevice(b.dataset.rm);
        renderDevs();
      }));
  }

  async function connect(phrase){
    peers = 0;   /* on repart de zéro — l'ancien décompte ne vaut plus */
    await kvSet(SYNC_KEY, phrase);
    const self = await deviceSelf();
    sh.body.innerHTML =
      `<div class="sy-phrase"><span>${esc(phrase)}</span></div>
       <p class="hint" style="text-align:center">Sur l’autre appareil : <b>Échanger → Mes appareils</b>, puis cette phrase.</p>
       <div class="sy-status" id="syStatus">${ic('radio', 'ic-14')} Connexion…</div>
       <div class="sy-log" id="syLog"></div>
       <div class="sy-devs" id="syDevs"></div>`;
    sh.setFoot([
      btn('Changer de phrase', 'btn-ghost', () => { leave(); start(true); }),
      btn('Fermer', 'btn-primary', () => sh.close())
    ]);
    renderDevs();

    let lastSent = '';
    let sendFull = null;
    let sendHello = null;
    let undoSnap = null;
    const sendState = () => {
      if (!sendFull || !peers) return;
      const payload = fullPayload(S.companies, S.profile, S.orphans, S.tombs);
      const j = JSON.stringify(payload);
      if (j === lastSent) return;   /* rien de neuf = on ne renvoie pas (stop au ping-pong) */
      lastSent = j;
      sendFull(payload);
    };
    try {
      room = await openRoom('sync', phrase);
    } catch (e) {
      setStatus(`${ic('square-alert', 'ic-14')} Pas de connexion — réseau bloqué ? La sauvegarde .oc marche toujours.`);
      return;
    }
    {
      /* chaque appareil s'annonce — c'est ce qui nourrit la liste */
      const hello = room.makeAction('hello');
      sendHello = () => hello.send({ id: self.id, name: self.name });
      hello.onMessage = async obj => {
        if (!obj || !obj.id || obj.id === self.id) return;
        await upsertDevice(obj.id, obj.name);
        renderDevs();
      };
    }
    {
      const action = room.makeAction('full');
      sendFull = d => action.send(d);
      action.onMessage = obj => {
        if (!obj || obj.kind !== 'full' || !Array.isArray(obj.companies)) return;
        const r = syncMerge(obj, { companies: S.companies, orphans: S.orphans, profile: S.profile, tombs: S.tombs });
        const st = r.stats;
        const changed = st.addedC + st.updatedC + st.removedC + st.addedO + (st.profile === 'remote' ? 1 : 0);
        if (changed){
          undoSnap = undoSnap || {
            companies: JSON.stringify(S.companies), orphans: JSON.stringify(S.orphans),
            profile: JSON.stringify(S.profile), tombs: JSON.stringify(S.tombs)
          };
          applySynced(r);
          bus.refresh();
          logJ('Sync appareils : +' + st.addedC + ', ' + st.updatedC + ' maj, ' + st.removedC + ' suppr.');
          const log = q('#syLog');
          if (log){
            log.innerHTML =
              `<ul class="rc-lines">
                 ${st.addedC ? `<li>${ic('plus', 'ic-14')} <b>${st.addedC}</b> reçue${st.addedC > 1 ? 's' : ''}</li>` : ''}
                 ${st.updatedC ? `<li>${ic('pencil', 'ic-14')} <b>${st.updatedC}</b> mise${st.updatedC > 1 ? 's' : ''} à jour</li>` : ''}
                 ${st.removedC ? `<li>${ic('trash', 'ic-14')} <b>${st.removedC}</b> supprimée${st.removedC > 1 ? 's' : ''}</li>` : ''}
                 ${st.addedO ? `<li>${ic('contact', 'ic-14')} <b>${st.addedO}</b> contact${st.addedO > 1 ? 's' : ''} à rattacher</li>` : ''}
                 ${st.profile === 'remote' ? `<li>${ic('user', 'ic-14')} profil : la version la plus récente a été prise
                    <button class="btn btn-sm" id="syKeepProf">Garder plutôt la mienne</button></li>` : ''}
               </ul>`;
            /* conflit de profil : le plus récent est pris d'office (la
               recommandation), un tap suffit pour reprendre le sien —
               il redevient le plus récent et repart vers les appareils */
            const kp = log.querySelector('#syKeepProf');
            if (kp){
              const mine = undoSnap.profile;
              kp.addEventListener('click', () => {
                S.profile = normalizeProfile(JSON.parse(mine));
                saveProfile();          /* re-tamponne updatedAt : elle gagne partout */
                sendState();
                kp.remove();
                toast('Ton profil est repris — il repart vers tes appareils.');
              });
            }
          }
          const snap = undoSnap;
          showUndo(`${ic('check', 'ic-14')} Appareils synchronisés.`, () => {
            applySynced({
              companies: JSON.parse(snap.companies), orphans: JSON.parse(snap.orphans),
              profile: JSON.parse(snap.profile), tombs: JSON.parse(snap.tombs)
            });
            bus.refresh();
            toast('Sync annulée — tout est revenu comme avant.');
          });
        }
        setStatus(`${ic('check', 'ic-14')} À jour ✓ — ${peers} appareil${peers > 1 ? 's' : ''} en face`);
        sendState();   /* converge : ne repart que si quelque chose a changé */
      };
    }
    room.onPeerJoin = () => {
      peers++;
      setStatus(`${ic('radio', 'ic-14')} ${peers} appareil${peers > 1 ? 's' : ''} en face — envoi…`);
      if (sendHello) sendHello();
      sendState();
    };
    room.onPeerLeave = () => {
      peers = Math.max(0, peers - 1);
      setStatus(peers ? `${ic('radio', 'ic-14')} ${peers} appareil${peers > 1 ? 's' : ''} en face`
                      : `${ic('clock', 'ic-14')} En attente de l’autre appareil… (laisse la feuille ouverte)`);
    };
    setStatus(`${ic('clock', 'ic-14')} En attente de l’autre appareil… (laisse la feuille ouverte)`);
    /* tant que la feuille est ouverte, chaque enregistrement se propage */
    onChange = () => sendState();
    document.addEventListener('oc:change', onChange);
  }

  async function start(forceNew){
    const saved = forceNew ? '' : (await kvGet(SYNC_KEY) || '');
    if (saved){ connect(saved); return; }
    sh.setTitle('Mes appareils');
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 12px">Téléphone + ordinateur : une <b>phrase de liaison</b>, et tout se synchronise en direct — suivi privé compris (ce sont tes appareils).</p>
       <div class="pick-list">
         <button class="pick" id="syNew"><b>${ic('sparkles', 'ic-14')} Premier appareil</b><span>créer ma phrase de liaison</span></button>
         <button class="pick" id="syJoin"><b>${ic('switch', 'ic-14')} Appareil suivant</b><span>taper la phrase déjà créée</span></button>
       </div>`;
    sh.setFoot([btn('Fermer', 'btn-ghost', () => sh.close())]);
    q('#syNew').addEventListener('click', () => connect(makePhrase()));
    q('#syJoin').addEventListener('click', () => {
      sh.body.innerHTML =
        `<div class="field"><label for="syPhrase">La phrase de l’autre appareil</label>
           <input id="syPhrase" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ex : k7m3p-9xq2f"></div>`;
      const go = () => { const v = q('#syPhrase').value.trim().toLowerCase(); if (v) connect(v); };
      q('#syPhrase').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      sh.setFoot([btn('← Retour', 'btn-ghost', () => start(true)), btn('Relier', 'btn-primary', go)]);
      q('#syPhrase').focus();
    });
  }
  start(false);
}

/* ============ Salle de promo : partage communautaire en direct ============ */
export function openPromo(){
  let room = null;
  let peers = 0;
  const queue = [];      /* payloads reçus, présentés un par un */
  const seen = new Set();   /* le même envoi ne se représente pas */
  let showing = false;
  const leave = () => { if (room){ try { room.leave(); } catch (e) {} room = null; } };
  const sh = openSheet({ title: 'Salle de promo', icon: 'radio', onClose: leave });
  const q = s => sh.body.querySelector(s);

  const ask = async () => {
    const last = (await kvGet(PROMO_KEY)) || '';
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 12px">Un mot de passe pour toute la promo, et les fiches circulent en direct — <b>jamais ton suivi privé</b>.</p>
       <div class="field"><label for="prPass">Mot de passe de la salle</label>
         <input id="prPass" autocomplete="off" autocapitalize="off" placeholder="ex : promo-sio-2026" value="${esc(last)}"></div>`;
    const go = () => { const v = q('#prPass').value.trim(); if (v){ kvSet(PROMO_KEY, v); enter(v); } };
    q('#prPass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    sh.setFoot([btn('Fermer', 'btn-ghost', () => sh.close()), btn('Entrer', 'btn-primary', go)]);
    q('#prPass').focus();
  };

  async function enter(pass){
    sh.body.innerHTML =
      `<div class="sy-status" id="prStatus">${ic('radio', 'ic-14')} Connexion…</div>
       <div id="prZone"></div>
       <p class="hint" id="prHint" style="text-align:center">Chacun garde la feuille ouverte ; chaque envoi montre un aperçu avant fusion.</p>`;
    sh.setFoot([btn('Quitter la salle', 'btn-ghost', () => { leave(); ask(); }), btn('Fermer', 'btn-primary', () => sh.close())]);
    const setStatus = txt => { const el = q('#prStatus'); if (el) el.innerHTML = txt; };
    try {
      room = await openRoom('promo', pass);
    } catch (e) {
      setStatus(`${ic('square-alert', 'ic-14')} Pas de connexion — réseau bloqué ? Le fichier .oc marche toujours.`);
      return;
    }
    const share = room.makeAction('share');

    const mine = () => S.companies.filter(c => !isClosed(c) && !c.demo);
    /* ce qui part : tout par défaut, élagable d'un tap */
    const unsel = new Set();
    const chosen = () => mine().filter(c => !unsel.has(c.id));
    let choosing = false;
    const refreshStatus = () => {
      const n = chosen().length;
      setStatus(peers
        ? `${ic('radio', 'ic-14')} <b>${peers}</b> camarade${peers > 1 ? 's' : ''} dans la salle`
        : `${ic('clock', 'ic-14')} Personne d’autre pour l’instant…`);
      const zone = q('#prZone');
      if (!zone) return;
      if (!peers || !mine().length){ zone.innerHTML = ''; return; }
      zone.innerHTML =
        `<button class="btn btn-primary pr-send" id="prSend"${n ? '' : ' disabled'}>${ic('share', 'ic-14')} Envoyer ${n ? n + ' piste' + (n > 1 ? 's' : '') : '…'}</button>
         <button class="linklike" id="prPick" style="margin-top:6px">${choosing ? 'Replier la liste' : 'Choisir ce qui part…'}</button>
         ${choosing ? `<div class="pick-list" style="margin-top:8px">
           ${mine().map(c =>
             `<button class="pick pk${unsel.has(c.id) ? '' : ' on'}" data-id="${c.id}" aria-pressed="${!unsel.has(c.id)}">
                ${ic('checkbox', 'ic-20 ic-off')}${ic('checkbox-on', 'ic-20 ic-on')}
                <div class="pk-m"><b>${esc(c.name)}</b>${c.city ? `<span>${esc(c.city)}</span>` : ''}</div>
              </button>`).join('')}
         </div>` : ''}`;
      q('#prSend').addEventListener('click', () => {
        const list = chosen();
        if (!list.length) return;
        share.send(sharePayload(list));
        logJ('Donné (salle de promo) : ' + list.length + ' piste(s)');
        toast('Parti vers ' + peers + ' camarade' + (peers > 1 ? 's' : '') + ' ✓');
      });
      q('#prPick').addEventListener('click', () => { choosing = !choosing; refreshStatus(); });
      zone.querySelectorAll('.pk').forEach(b =>
        b.addEventListener('click', () => {
          const id = b.dataset.id;
          unsel.has(id) ? unsel.delete(id) : unsel.add(id);
          b.classList.toggle('on', !unsel.has(id));
          b.setAttribute('aria-pressed', !unsel.has(id));
          const n2 = chosen().length;
          const send = q('#prSend');
          send.disabled = !n2;
          send.innerHTML = `${ic('share', 'ic-14')} Envoyer ${n2 ? n2 + ' piste' + (n2 > 1 ? 's' : '') : '…'}`;
        }));
    };
    const showNext = () => {
      if (showing || !queue.length) return;
      showing = true;
      const { obj, from } = queue.shift();
      const psh = openSheet({ title: 'Reçu en direct', icon: 'inbox', onClose: () => { showing = false; showNext(); } });
      mergePreviewInto(psh, obj, { from, onCancel: () => psh.close() });
    };
    share.onMessage = (obj, meta) => {
      if (!obj || obj.kind !== 'share' || !Array.isArray(obj.companies)) return;
      obj.companies = obj.companies.filter(x => x && typeof x === 'object' && x.name).slice(0, 2000);
      if (!obj.companies.length) return;
      /* le même envoi (re-clic, rediffusion) ne réapparaît pas */
      const key = JSON.stringify(obj.companies);
      if (seen.has(key)) return;
      seen.add(key);
      if (seen.size > 30) seen.delete(seen.values().next().value);
      queue.push({ obj, from: 'camarade ' + String((meta && meta.peerId) || '').slice(0, 4) });
      showNext();
    };
    room.onPeerJoin = () => { peers++; refreshStatus(); };
    room.onPeerLeave = () => { peers = Math.max(0, peers - 1); refreshStatus(); };
    refreshStatus();
  }
  ask();
}
