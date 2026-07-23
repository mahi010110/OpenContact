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
import { syncMerge, syncPrivateMerge } from '../engine/sync.js';
import { edAvailable, makeDeviceKeys, recoveryKeys, ringInit, ringAddDevice,
         ringCommand, ringTransfer, ringRecover, mergeRing, actionsFor, deviceIn } from '../engine/ring.js';
import { SYNC_KEY, RELAYS_KEY, TURN_KEY, DEVICE_KEY, DEVICES_KEY, RING_KEY,
         DATA_KEY, PROFILE_KEY, JOURNAL_KEY, ORPHANS_KEY, TOMBS_KEY, PROMO_KEY, VAULT_KEY,
         CAMPAIGNS_KEY, MAIL_KEY, AI_KEY, MISSIONS_KEY, COMPANION_KEY, ANALYSIS_KEY,
         PROPOSALS_KEY, kvGet, kvSet, kvDel, docClear } from '../engine/storage.js';
import { relayTally, liaisonStage } from '../engine/transport.js';
import { S, bus, applySynced, saveProfile, logJ } from './state.js';
import { ic, toast, showUndo } from './dom.js';

let libP = null;
let libM = null;    /* le module chargé — pour sonder l'état réel des relais */
/* un échec de chargement ne se grave pas : sans ça, la première visite
   hors ligne condamnait le P2P jusqu'au rechargement (la promesse
   rejetée restait en cache alors que « Réessayer » relançait join) */
const loadLib = () => libP || (libP = import('../assets/vendor/trystero-nostr.min.js')
  .then(m => (libM = m), e => { libP = null; throw e; }));

/* l'état réel des WebSockets vers les relais — {total, open, pending}.
   Sans bibliothèque chargée : rien à sonder, tout à zéro. */
export const relaySnapshot = () => relayTally(libM && libM.getRelaySockets());

/* délai de grâce avant de déclarer « aucun relais joignable » : les
   sockets se (re)connectent, on ne crie pas au loup au premier instant */
const GRACE_MS = 12000;

/* surveille l'honnêteté d'une salle éphémère (promo, rendez-vous QR) :
   rappelle `cb(stage)` toutes les 2 s — stage de engine/transport.js.
   `fail()` se branche sur onJoinError (pair annoncé, liaison en échec). */
export function watchLiaison(getPeers, cb){
  const t0 = Date.now();
  let rtcFail = false;
  const tick = () => cb(liaisonStage({
    relays: relaySnapshot(), peers: getPeers(), exchanged: getPeers() > 0,
    rtcFail, graceOver: Date.now() - t0 > GRACE_MS
  }));
  const iv = setInterval(tick, 2000);
  return { stop: () => clearInterval(iv), fail: () => { rtcFail = true; tick(); }, tick };
}

async function sha256hex(s){
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}
/* la phrase ne sort jamais telle quelle : la salle porte un hash.
   Relais personnalisés possibles (oc_relays_v1). Le préfixe reste
   historique (« sync- », « promo- », « give- » pour le QR de
   rendez-vous) — compat entre versions. */
export async function openRoom(kind, phrase, callbacks){
  const { joinRoom } = await loadLib();
  const id = kind + '-' + (await sha256hex('opencontact·' + kind + '·' + phrase)).slice(0, 24);
  const cfg = { appId: 'opencontact', password: phrase };
  try {
    const urls = JSON.parse(await kvGet(RELAYS_KEY) || 'null');
    if (Array.isArray(urls) && urls.length) cfg.relayConfig = { urls };
  } catch (e) {}
  try {
    /* TURN personnalisé : pour les réseaux qui bloquent le pair-à-pair */
    const turn = JSON.parse(await kvGet(TURN_KEY) || 'null');
    if (Array.isArray(turn) && turn.length) cfg.turnConfig = turn;
  } catch (e) {}
  return joinRoom(cfg, id, callbacks);
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

/* ---------- l'anneau d'appareils (appareil principal) ----------
   État persistant : { keys: {pub, seed}, ring, applied: [cid…] } —
   scellé au repos quand le profil est protégé (SEALABLE). Les
   commandes reçues me visant sont appliquées ici ; « verrouiller »
   est délégué au verrou par événement (pas d'import croisé). */
let ringSt = null;
let ringLoaded = false;
async function loadRingSt(){
  if (ringLoaded) return ringSt;
  ringLoaded = true;
  try { ringSt = JSON.parse(await kvGet(RING_KEY) || 'null'); } catch (e) { ringSt = null; }
  return ringSt;
}
const saveRingSt = () => kvSet(RING_KEY, JSON.stringify(ringSt));
export const getRing = () => (ringSt && ringSt.ring) || null;
export async function ringCompanion(){
  await loadRingSt();
  return ((getRing() && getRing().devices) || []).find(d => d && d.role === 'companion') || null;
}
export async function amMain(){
  const r = getRing();
  if (!r) return false;
  return r.main === (await deviceSelf()).id;
}
/* les clés de CET appareil — créées au premier besoin */
export async function ensureKeys(){
  await loadRingSt();
  if (ringSt && ringSt.keys) return ringSt.keys;
  if (!(await edAvailable())) return null;
  const keys = await makeDeviceKeys();
  ringSt = Object.assign({ ring: null, applied: [] }, ringSt || {}, { keys });
  await saveRingSt();
  return keys;
}
/* à l'activation de la protection : cet appareil devient le principal */
export async function ensureRing(recoveryPhrase){
  const keys = await ensureKeys();
  if (!keys) return false;
  if (ringSt.ring) return true;
  const self = await deviceSelf();
  const rec = await recoveryKeys(recoveryPhrase);
  ringSt.ring = await ringInit(self, keys.pub, keys.seed, rec.pub);
  await saveRingSt();
  logJ('Appareil principal : ' + self.name);
  sendRing();
  emit();
  return true;
}
/* récupération d'urgence (D7) : cet appareil devient le principal,
   prouvé par l'ANCIENNE phrase, re-scellé par la NOUVELLE */
export async function recoverRing(oldPhrase, newPhrase){
  const keys = await ensureKeys();
  if (!keys) return false;
  const self = await deviceSelf();
  const newRec = await recoveryKeys(newPhrase);
  if (ringSt.ring){
    const oldRec = await recoveryKeys(oldPhrase);
    ringSt.ring = await ringRecover(ringSt.ring, oldRec.seed, self, keys.pub, newRec.pub);
  } else {
    ringSt.ring = await ringInit(self, keys.pub, keys.seed, newRec.pub);
  }
  ringSt.applied = [];
  await saveRingSt();
  logJ('Récupération : cet appareil devient le principal');
  sendRing();
  emit();
  return true;
}
/* commandes du principal (l'appelant a déjà re-demandé le code) */
export async function ringDo(cmd, targetId){
  if (!(await amMain())) return false;
  ringSt.ring = await ringCommand(ringSt.ring, ringSt.keys.seed, cmd, targetId);
  await saveRingSt();
  if (cmd === 'remove' || cmd === 'ban' || cmd === 'wipe') await removeDevice(targetId);
  logJ('Commande appareil : ' + cmd + ' → ' + targetId);
  sendRing();
  emit();
  return true;
}
export async function ringMakeMain(targetId){
  if (!(await amMain())) return false;
  ringSt.ring = await ringTransfer(ringSt.ring, ringSt.keys.seed, targetId);
  await saveRingSt();
  logJ('Rôle principal transféré');
  sendRing();
  emit();
  return true;
}
/* le principal inscrit le Compagnon dans l'anneau (rôle companion) —
   identité apprise sur le canal local authentifié par le code court */
export async function ringAddCompanion(dev){
  if (!(await amMain())) return false;
  ringSt.ring = await ringAddDevice(ringSt.ring, ringSt.keys.seed,
    { id: dev.id, name: dev.name, pub: dev.pub, role: 'companion' });
  await saveRingSt();
  logJ('Compagnon associé : ' + dev.name);
  sendRing();
  emit();
  return true;
}
/* réception d'un anneau distant : fusion vérifiée, puis les
   commandes qui me visent — appliquées UNE fois, même hors ligne
   au moment de l'émission (elles voyagent dans l'anneau) */
async function onRingMsg(incoming){
  await loadRingSt();
  const mine = getRing();
  const r = await mergeRing(mine, incoming);
  if (!r.changed) return;
  ringSt = Object.assign({ keys: null, applied: [] }, ringSt || {}, { ring: r.ring });
  await saveRingSt();
  if (r.recovered) toast('Ton appareil principal a changé — récupération d’urgence.');
  const self = await deviceSelf();
  const acts = actionsFor(r.ring, self.id, ringSt.applied);
  for (const a of acts){
    ringSt.applied = (ringSt.applied || []).concat([a.cid]).slice(-80);
    await saveRingSt();
    if (a.cmd === 'lock'){
      document.dispatchEvent(new CustomEvent('oc:ringlock'));
      toast('Verrouillé depuis ton appareil principal.');
    } else if (a.cmd === 'remove' || a.cmd === 'ban'){
      await breakLink();
      toast('Cet appareil a été retiré de tes appareils.');
    } else if (a.cmd === 'wipe'){
      logJ('Effacement demandé par l’appareil principal');
      /* TOUT ce qui est à l'utilisateur part : données, suivi,
         campagnes, jetons de messagerie, clés d'IA, missions,
         identité d'appareil, documents (CV, lettre) */
      for (const k of [DATA_KEY, PROFILE_KEY, JOURNAL_KEY, ORPHANS_KEY, TOMBS_KEY,
                       SYNC_KEY, RELAYS_KEY, TURN_KEY, PROMO_KEY, DEVICE_KEY, DEVICES_KEY, RING_KEY, VAULT_KEY,
                       CAMPAIGNS_KEY, MAIL_KEY, AI_KEY, MISSIONS_KEY, COMPANION_KEY, ANALYSIS_KEY,
                       PROPOSALS_KEY]) await kvDel(k);
      await docClear().catch(() => {});   /* toutes les variantes CV & lettres */
      location.replace(location.pathname);
      return;
    }
  }
  emit();
}
let sendRingRaw = null;
function sendRing(){
  const r = getRing();
  if (r && sendRingRaw) sendRingRaw(r);
}

/* ---------- l'état vivant ---------- */
const live = {
  state: 'off',        /* off · connecting · norelay · wait · rtcfail · link · on · err */
  peers: 0,
  relays: { total: 0, open: 0, pending: 0 },
  exchanged: false,    /* un échange a réellement été reçu — condition de « à jour » */
  rtcFail: false,      /* pair annoncé mais liaison directe en échec */
  since: 0,            /* départ de la (re)connexion — pour le délai de grâce */
  phrase: '',
  lastStats: null,     /* dernier lot appliqué (affiché par la feuille) */
  prevProfile: null    /* mon profil d'avant, si celui d'un autre appareil a été pris */
};
export const getSync = () => live;
const emit = () => document.dispatchEvent(new CustomEvent('oc:sync'));

/* recalcule l'étape honnête depuis les faits ; émet si elle a bougé */
let watchIv = null;
function refreshStage(force){
  if (!room) return;
  const relays = relaySnapshot();
  const stage = liaisonStage({
    relays, peers: live.peers, exchanged: live.exchanged,
    rtcFail: live.rtcFail, graceOver: Date.now() - live.since > GRACE_MS
  });
  const moved = stage !== live.state ||
    relays.open !== live.relays.open || relays.total !== live.relays.total;
  live.relays = relays;
  live.state = stage;
  if (moved || force) emit();
}
function startWatch(){
  stopWatch();
  watchIv = setInterval(() => refreshStage(false), 2000);
}
function stopWatch(){
  if (watchIv){ clearInterval(watchIv); watchIv = null; }
}

let room = null;
let sendFull = null;
let sendHello = null;
let lastSent = '';
let sendJob = null;
let sendAgain = false;
let gen = 0;             /* jeton : une (re)connexion invalide les précédentes */

const parseList = raw => {
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
};
async function privateState(){
  const [campaigns, missions] = await Promise.all([kvGet(CAMPAIGNS_KEY), kvGet(MISSIONS_KEY)]);
  return { campaigns: parseList(campaigns), missions: parseList(missions) };
}
async function writePrivateState(next){
  await Promise.all([
    kvSet(CAMPAIGNS_KEY, JSON.stringify(next.campaigns || [])),
    kvSet(MISSIONS_KEY, JSON.stringify(next.missions || []))
  ]);
  document.dispatchEvent(new CustomEvent('oc:campaigns-sync'));
  document.dispatchEvent(new CustomEvent('oc:change'));
}
/* API volontairement petite, aussi utilisée par le scénario C8 : elle
   applique exactement le même rail privé que la réception réseau. */
export async function applyPrivatePayload(payload){
  const mine = await privateState();
  const merged = syncPrivateMerge(payload || {}, mine);
  if (merged.stats.campaigns || merged.stats.missions) await writePrivateState(merged);
  return merged;
}

const sendState = () => {
  if (!sendFull || !live.peers) return;
  if (sendJob){ sendAgain = true; return; }
  sendJob = (async () => {
    do {
      sendAgain = false;
      const priv = await privateState();
      if (!sendFull || !live.peers) return;
      const payload = Object.assign(fullPayload(S.companies, S.profile, S.orphans, S.tombs), priv);
      const j = JSON.stringify(payload);
      if (j !== lastSent){
        lastSent = j;           /* rien de neuf = stop au ping-pong */
        sendFull(payload);
      }
    } while (sendAgain);
  })().catch(() => {}).finally(() => {
    sendJob = null;
    if (sendAgain) sendState();
  });
};
/* chaque enregistrement, où qu'il vienne, se propage — en continu */
document.addEventListener('oc:change', () => sendState());
/* le réseau revient : on retente sans rien demander */
window.addEventListener('online', () => {
  if (live.phrase && (live.state === 'err' || live.state === 'off' || live.state === 'norelay'))
    join(live.phrase);
});

function closeRoom(){
  stopWatch();
  if (room){ try { room.leave(); } catch (e) {} room = null; }
  sendFull = null;
  sendHello = null;
  sendRingRaw = null;
  lastSent = '';
  live.peers = 0;
  live.relays = { total: 0, open: 0, pending: 0 };
  live.exchanged = false;
  live.rtcFail = false;
}

async function join(phrase){
  const my = ++gen;
  closeRoom();
  live.phrase = phrase;
  live.state = 'connecting';
  live.since = Date.now();
  emit();
  const self = await deviceSelf();
  let r;
  try {
    r = await openRoom('sync', phrase, {
      /* un appareil s'est annoncé via les relais mais la liaison
         directe n'aboutit pas (NAT/pare-feu) — on le dit, on ne
         laisse plus « en liaison » mentir */
      onJoinError: () => {
        if (my !== gen) return;
        if (!live.rtcFail) logJ('Sync appareils : pair en vue, liaison directe en échec');
        live.rtcFail = true;
        refreshStage(false);
      }
    });
  } catch (e) {
    if (my !== gen) return;
    live.state = 'err';
    emit();
    return;
  }
  if (my !== gen){ try { r.leave(); } catch (e) {} return; }
  room = r;
  startWatch();
  refreshStage(false);

  const keys = await ensureKeys();          /* identité signée de cet appareil */
  const hello = room.makeAction('hello');
  sendHello = () => hello.send({ id: self.id, name: self.name, pub: keys ? keys.pub : '' });
  hello.onMessage = async obj => {
    if (!obj || !obj.id || obj.id === self.id) return;
    await upsertDevice(obj.id, obj.name);
    /* je suis le principal : un appareil du canal authentifié qui
       annonce sa clé entre dans l'anneau (signé, propagé) */
    if (obj.pub && await amMain() && !deviceIn(getRing(), obj.id)){
      ringSt.ring = await ringAddDevice(getRing(), ringSt.keys.seed, obj);
      await saveRingSt();
      sendRing();
    }
    emit();
  };
  const ringAct = room.makeAction('ring');
  sendRingRaw = d => { try { ringAct.send(d); } catch (e) {} };
  ringAct.onMessage = obj => { onRingMsg(obj).catch(() => {}); };

  const full = room.makeAction('full');
  sendFull = d => full.send(d);
  let receiveQueue = Promise.resolve();
  full.onMessage = obj => { receiveQueue = receiveQueue.then(async () => {
    if (!obj || obj.kind !== 'full' || !Array.isArray(obj.companies)) return;
    const r2 = syncMerge(obj, { companies: S.companies, orphans: S.orphans, profile: S.profile, tombs: S.tombs });
    const minePrivate = await privateState();
    const rPriv = syncPrivateMerge(obj, minePrivate);
    const st = r2.stats;
    const changed = st.addedC + st.updatedC + st.removedC + st.addedO +
      (st.profile === 'remote' ? 1 : 0) + rPriv.stats.campaigns + rPriv.stats.missions;
    if (changed){
      const snap = {
        companies: JSON.stringify(S.companies), orphans: JSON.stringify(S.orphans),
        profile: JSON.stringify(S.profile), tombs: JSON.stringify(S.tombs),
        campaigns: JSON.stringify(minePrivate.campaigns), missions: JSON.stringify(minePrivate.missions)
      };
      if (st.profile === 'remote' && !live.prevProfile) live.prevProfile = snap.profile;
      applySynced(r2);
      if (rPriv.stats.campaigns || rPriv.stats.missions) await writePrivateState(rPriv);
      bus.refresh();
      live.lastStats = Object.assign({ t: Date.now(), campaigns: rPriv.stats.campaigns,
        missions: rPriv.stats.missions }, st);
      logJ('Sync appareils : +' + st.addedC + ', ' + st.updatedC + ' maj, ' + st.removedC + ' suppr.');
      showUndo(`${ic('check', 'ic-14')} Appareils synchronisés.`, () => {
        applySynced({
          companies: JSON.parse(snap.companies), orphans: JSON.parse(snap.orphans),
          profile: JSON.parse(snap.profile), tombs: JSON.parse(snap.tombs)
        });
        writePrivateState({ campaigns: JSON.parse(snap.campaigns), missions: JSON.parse(snap.missions) });
        live.lastStats = null;
        live.prevProfile = null;
        bus.refresh();
        emit();
        toast('Sync annulée — tout est revenu comme avant.');
      });
    }
    /* l'échange est CONFIRMÉ : un instantané complet vient d'arriver.
       C'est lui — pas la salle, pas même le pair — qui autorise
       « à jour » (incident #14). */
    live.exchanged = true;
    refreshStage(true);
    sendState();   /* converge : ne repart que si quelque chose a changé */
  }).catch(() => {}); };

  room.onPeerJoin = () => {
    live.peers++;
    refreshStage(true);
    if (sendHello) sendHello();
    sendRing();
    sendState();
  };
  room.onPeerLeave = () => {
    live.peers = Math.max(0, live.peers - 1);
    if (!live.peers) live.exchanged = false;   /* prochaine liaison = nouvelle preuve */
    refreshStage(true);
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
