/* ============================================================
   OpenContact — interface · sync appareils EN CONTINU
   Dès qu'une phrase de liaison existe, l'app rejoint la salle en
   arrière-plan (paresseusement, ~2 s après le démarrage) et y
   RESTE : chaque enregistrement part vers les autres appareils,
   chaque réception s'applique (le plus récent gagne, CONTRAT §5)
   avec un Annuler ~30 s — tant que l'utilisateur n'a pas rompu le
   lien. La feuille « Mes appareils » (direct.js) n'est que le
   poste de gestion de cet état : elle n'ouvre plus de connexion.
   L'état est diffusé par l'événement `oc:sync` ; le transport
   (Trystero vendorisé) reste chargé à la demande.
   ============================================================ */
import { uid } from '../engine/utils.js';
import { normalizeProfile } from '../engine/model.js';
import { fullPayload } from '../engine/exchange.js';
import { syncMerge } from '../engine/sync.js';
import { SYNC_KEY, RELAYS_KEY, DEVICE_KEY, DEVICES_KEY, kvGet, kvSet } from '../engine/storage.js';
import { S, bus, applySynced, saveProfile, logJ } from './state.js';
import { ic, toast, showUndo } from './dom.js';

let libP = null;
const loadLib = () => libP || (libP = import('../assets/vendor/trystero-nostr.min.js'));

async function sha256hex(s){
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}
/* la phrase ne sort jamais telle quelle : la salle porte un hash.
   Relais personnalisés possibles (oc_relays_v1). Le préfixe reste
   historique (« sync- », « promo- ») — compat entre versions. */
export async function openRoom(kind, phrase){
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
export function makePhrase(){
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const u = crypto.getRandomValues(new Uint8Array(10));
  const c = i => abc[u[i] % abc.length];
  return [0, 1, 2, 3, 4].map(c).join('') + '-' + [5, 6, 7, 8, 9].map(c).join('');
}

/* ---------- identité de CET appareil & appareils vus ---------- */
function guessName(){
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return os + (br ? ' · ' + br : '');
}
export async function deviceSelf(){
  try {
    const d = JSON.parse(await kvGet(DEVICE_KEY) || 'null');
    if (d && d.id) return d;
  } catch (e) {}
  const d = { id: uid(), name: guessName() };
  await kvSet(DEVICE_KEY, JSON.stringify(d));
  return d;
}
export async function loadDevices(){
  try { return JSON.parse(await kvGet(DEVICES_KEY) || '[]') || []; } catch (e) { return []; }
}
async function upsertDevice(id, name){
  const list = (await loadDevices()).filter(d => d && d.id && d.id !== id);
  list.unshift({ id, name: String(name || 'Appareil').slice(0, 40), seen: Date.now() });
  list.sort((a, b) => (b.seen || 0) - (a.seen || 0));
  await kvSet(DEVICES_KEY, JSON.stringify(list.slice(0, 12)));
}
export async function removeDevice(id){
  const list = (await loadDevices()).filter(d => d.id !== id);
  await kvSet(DEVICES_KEY, JSON.stringify(list));
}
export const DEVICES_MAX = 5;

/* ---------- l'état vivant ---------- */
const live = {
  state: 'off',        /* off · wait (personne en face) · on · err */
  peers: 0,
  phrase: '',
  lastStats: null,     /* dernier lot appliqué (affiché par la feuille) */
  prevProfile: null    /* mon profil d'avant, si celui d'un autre appareil a été pris */
};
export const getSync = () => live;
const emit = () => document.dispatchEvent(new CustomEvent('oc:sync'));

let room = null;
let sendFull = null;
let sendHello = null;
let lastSent = '';
let gen = 0;             /* jeton : une (re)connexion invalide les précédentes */

const sendState = () => {
  if (!sendFull || !live.peers) return;
  const payload = fullPayload(S.companies, S.profile, S.orphans, S.tombs);
  const j = JSON.stringify(payload);
  if (j === lastSent) return;   /* rien de neuf = on ne renvoie pas (stop au ping-pong) */
  lastSent = j;
  sendFull(payload);
};
/* chaque enregistrement, où qu'il vienne, se propage — en continu */
document.addEventListener('oc:change', () => sendState());
/* le réseau revient : on retente sans rien demander */
window.addEventListener('online', () => {
  if (live.phrase && (live.state === 'err' || live.state === 'off')) join(live.phrase);
});

function closeRoom(){
  if (room){ try { room.leave(); } catch (e) {} room = null; }
  sendFull = null;
  sendHello = null;
  lastSent = '';
  live.peers = 0;
}

async function join(phrase){
  const my = ++gen;
  closeRoom();
  live.phrase = phrase;
  live.state = 'wait';
  emit();
  const self = await deviceSelf();
  let r;
  try {
    r = await openRoom('sync', phrase);
  } catch (e) {
    if (my !== gen) return;
    live.state = 'err';
    emit();
    return;
  }
  if (my !== gen){ try { r.leave(); } catch (e) {} return; }
  room = r;

  const hello = room.makeAction('hello');
  sendHello = () => hello.send({ id: self.id, name: self.name });
  hello.onMessage = async obj => {
    if (!obj || !obj.id || obj.id === self.id) return;
    await upsertDevice(obj.id, obj.name);
    emit();
  };

  const full = room.makeAction('full');
  sendFull = d => full.send(d);
  full.onMessage = obj => {
    if (!obj || obj.kind !== 'full' || !Array.isArray(obj.companies)) return;
    const r2 = syncMerge(obj, { companies: S.companies, orphans: S.orphans, profile: S.profile, tombs: S.tombs });
    const st = r2.stats;
    const changed = st.addedC + st.updatedC + st.removedC + st.addedO + (st.profile === 'remote' ? 1 : 0);
    if (changed){
      const snap = {
        companies: JSON.stringify(S.companies), orphans: JSON.stringify(S.orphans),
        profile: JSON.stringify(S.profile), tombs: JSON.stringify(S.tombs)
      };
      if (st.profile === 'remote' && !live.prevProfile) live.prevProfile = snap.profile;
      applySynced(r2);
      bus.refresh();
      live.lastStats = Object.assign({ t: Date.now() }, st);
      logJ('Sync appareils : +' + st.addedC + ', ' + st.updatedC + ' maj, ' + st.removedC + ' suppr.');
      showUndo(`${ic('check', 'ic-14')} Appareils synchronisés.`, () => {
        applySynced({
          companies: JSON.parse(snap.companies), orphans: JSON.parse(snap.orphans),
          profile: JSON.parse(snap.profile), tombs: JSON.parse(snap.tombs)
        });
        live.lastStats = null;
        live.prevProfile = null;
        bus.refresh();
        emit();
        toast('Sync annulée — tout est revenu comme avant.');
      });
    }
    live.state = 'on';
    emit();
    sendState();   /* converge : ne repart que si quelque chose a changé */
  };

  room.onPeerJoin = () => {
    live.peers++;
    live.state = 'on';
    emit();
    if (sendHello) sendHello();
    sendState();
  };
  room.onPeerLeave = () => {
    live.peers = Math.max(0, live.peers - 1);
    if (!live.peers) live.state = 'wait';
    emit();
  };
}

/* ---------- l'API de la feuille de gestion ---------- */
/* (re)lie cet appareil avec cette phrase — elle devient persistante */
export async function startSync(phrase){
  await kvSet(SYNC_KEY, phrase);
  join(phrase);
}
/* rompre le lien : cet appareil ne se synchronise plus (les autres
   gardent leurs données) ; la liste des appareils vus est vidée */
export async function breakLink(){
  gen++;
  closeRoom();
  live.state = 'off';
  live.phrase = '';
  live.lastStats = null;
  live.prevProfile = null;
  await kvSet(SYNC_KEY, '');
  await kvSet(DEVICES_KEY, '[]');
  emit();
}
/* conflit de profil : reprendre le mien — il redevient le plus
   récent et repart vers les autres appareils */
export function keepMyProfile(){
  if (!live.prevProfile) return;
  S.profile = normalizeProfile(JSON.parse(live.prevProfile));
  saveProfile();          /* re-tamponne updatedAt : elle gagne partout */
  live.prevProfile = null;
  emit();
  toast('Ton profil est repris — il repart vers tes appareils.');
}
/* au démarrage (appelé en différé par app.js) : une phrase existe
   = on rejoint, sinon on ne charge rien */
export async function initSyncLive(){
  const saved = (await kvGet(SYNC_KEY)) || '';
  if (saved) join(saved);
}
