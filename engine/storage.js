/* ============================================================
   OpenContact — moteur · stockage
   kv* : pistes / profil / journal — 4 niveaux (window.storage,
   IndexedDB, localStorage, mémoire), l'interface lit getBackend()
   pour décider seule comment alerter. Depuis la v6.1, IndexedDB
   (base oc_kv_v1) est le rang principal : capacité bien plus
   grande que localStorage, écritures asynchrones ; les MÊMES clés
   y sont utilisées, et l'ancien localStorage reste lu en repli —
   la migration est donc automatique et sans perte. doc* : PDF
   (CV / lettre) dans une base SÉPARÉE (oc_docs_v1) — un PDF lourd
   ne peut jamais bloquer ni faire perdre les pistes.
   Coffre : quand le profil protégé est actif (clé attachée via
   vaultAttach), les clés de SEALABLE sont écrites scellées
   (OCV1., voir engine/vault.js) et relues en clair — les valeurs
   claires héritées restent lues telles quelles.
   Aucun accès au DOM.
   ============================================================ */
import { sealValue, openValue, isSealed } from './vault.js';

export const DATA_KEY = 'oc_data_v3';
export const PROFILE_KEY = 'oc_profile_v1';
export const JOURNAL_KEY = 'oc_journal_v1';
export const ORPHANS_KEY = 'oc_orphans_v1';   /* contacts « à rattacher » (sans entreprise) */
export const TOMBS_KEY = 'oc_tombs_v1';       /* suppressions (tombstones) — pour la sync appareils */
export const SYNC_KEY = 'oc_sync_v1';         /* phrase de liaison de MES appareils */
export const RELAYS_KEY = 'oc_relays_v1';     /* relais P2P personnalisés (optionnel) */
export const TURN_KEY = 'oc_turn_v1';         /* serveurs TURN personnalisés (optionnel — réseaux qui bloquent le P2P) */
export const DEVICE_KEY = 'oc_device_v1';     /* cet appareil : {id, name} */
export const DEVICES_KEY = 'oc_devices_v1';   /* appareils reliés déjà vus : [{id, name, seen}] */
export const PROMO_KEY = 'oc_promo_v1';       /* dernier mot de passe de partage en groupe */
export const VAULT_KEY = 'oc_vault_v1';       /* métadonnée du coffre (enveloppes de la clé maîtresse) */
export const RING_KEY = 'oc_devring_v1';      /* anneau d'appareils signé + clés de CET appareil */
export const CAMPAIGNS_KEY = 'oc_campaigns_v1'; /* campagnes de prospection (privé) */
export const MAIL_KEY = 'oc_mail_v1';         /* connexions messagerie (jetons — toujours sous coffre) */
export const AI_KEY = 'oc_ai_v1';             /* connexions IA (clés — toujours sous coffre) */
export const MISSIONS_KEY = 'oc_missions_v1'; /* bons de mission confiés au Compagnon */
export const COMPANION_KEY = 'oc_companion_v1'; /* association au Compagnon (clé de canal — toujours sous coffre) */
export const ANALYSIS_KEY = 'oc_analysis_v1'; /* dernière analyse d'e-mails à reprendre / trier */
export const PROPOSALS_KEY = 'oc_proposals_v1'; /* propositions de l'assistant IA (MCP) à trier */
export const THEME_KEY = 'oc_theme';
export const VIEW_KEY = 'oc_view';   /* héritée, plus écrite — épinglée par le test de contrat */
export const OLD_V2 = 'oc_data_v2';
export const OLD_V1 = 'ais_stage_targets_v1';

let backend = 'memory';
const mem = {};
let kvDb = null;

function kvOpenIdb(){
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('noidb'));
    const open = indexedDB.open('oc_kv_v1', 1);
    open.onupgradeneeded = () => { open.result.createObjectStore('kv'); };
    open.onerror = () => rej(open.error || new Error('idb'));
    open.onsuccess = () => res(open.result);
  });
}
/* les navigateurs mobiles FERMENT de force une connexion IndexedDB
   sous pression mémoire (l'onglet reste ouvert !) — la connexion se
   rouvre donc à la demande, et chaque requête retente UNE fois sur
   une connexion morte plutôt que d'échouer en silence */
async function ensureDb(){
  if (kvDb) return kvDb;
  kvDb = await kvOpenIdb();
  kvDb.onclose = () => { kvDb = null; };
  return kvDb;
}
async function kvIdbReq(mode, fn){
  for (let essai = 0; ; essai++){
    try {
      const db = await ensureDb();
      return await new Promise((res, rej) => {
        let rq;
        try { rq = fn(db.transaction('kv', mode).objectStore('kv')); }
        catch (e) { return rej(e); }
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error || new Error('idb'));
      });
    } catch (e) {
      kvDb = null;
      if (essai) throw e;
    }
  }
}

export async function kvInit(){
  if (window.storage){
    try { await window.storage.set('oc_probe', '1'); backend = 'claude'; return; } catch (e) {}
  }
  try {
    await kvIdbReq('readwrite', s => s.put('1', 'oc_probe'));
    backend = 'idb';
    return;
  } catch (e) { kvDb = null; }
  try { localStorage.setItem('oc_probe', '1'); backend = 'local'; } catch (e) { backend = 'memory'; }
}
async function rawGet(k){
  try {
    if (backend === 'claude'){ const r = await window.storage.get(k); return r ? r.value : null; }
    if (backend === 'idb'){
      const v = await kvIdbReq('readonly', s => s.get(k));
      if (v !== undefined && v !== null) return v;
      /* repli lecture : les données d'avant la migration vivent en localStorage */
      try { return localStorage.getItem(k); } catch (e) { return null; }
    }
    if (backend === 'local') return localStorage.getItem(k);
    return mem[k] ?? null;
  } catch (e) { return null; }
}
async function rawSet(k, v){
  try {
    if (backend === 'claude'){ await window.storage.set(k, v); return true; }
    if (backend === 'idb'){ await kvIdbReq('readwrite', s => s.put(v, k)); return true; }
    if (backend === 'local'){ localStorage.setItem(k, v); return true; }
    mem[k] = v; return false;
  } catch (e) { return false; }
}
export async function kvDel(k){
  try {
    if (backend === 'claude'){
      if (typeof window.storage.delete === 'function') await window.storage.delete(k);
      else await window.storage.set(k, '');
      return true;
    }
    if (backend === 'idb'){ await kvIdbReq('readwrite', s => s.delete(k)); }
    try { localStorage.removeItem(k); } catch (e) {}   /* aussi le repli hérité */
    if (backend === 'memory') delete mem[k];
    return true;
  } catch (e) { return false; }
}

/* ---------- le coffre : valeurs scellées au repos ----------
   Quand le profil protégé est actif, les clés ci-dessous sont
   écrites enveloppées (`OCV1.`, voir engine/vault.js) et relues
   en clair de façon transparente. Les valeurs claires héritées
   restent lues telles quelles (migration à l'écriture). Une
   lecture scellée SANS clé attachée lève `verrou` — jamais un
   `null` silencieux qui ferait croire à une base vide. */
export const SEALABLE = new Set([DATA_KEY, PROFILE_KEY, JOURNAL_KEY, ORPHANS_KEY,
  TOMBS_KEY, SYNC_KEY, RELAYS_KEY, TURN_KEY, DEVICE_KEY, DEVICES_KEY, PROMO_KEY, RING_KEY,
  CAMPAIGNS_KEY, MAIL_KEY, AI_KEY, MISSIONS_KEY, COMPANION_KEY, ANALYSIS_KEY,
  PROPOSALS_KEY]);
let vKey = null;
export function vaultAttach(key){ vKey = key || null; }
export function vaultDetach(){ vKey = null; }
export function vaultActive(){ return !!vKey; }

export async function kvGet(k){
  const raw = await rawGet(k);
  if (raw == null || !isSealed(raw)) return raw;
  if (!vKey) throw new Error('verrou');
  return openValue(vKey, k, raw);      /* lève `coffre` si altéré */
}
export async function kvSet(k, v){
  if (vKey && SEALABLE.has(k) && v != null && !isSealed(v))
    v = await sealValue(vKey, k, String(v));
  return rawSet(k, v);
}
/* migration à l'activation : sceller l'existant (idempotent —
   une valeur déjà scellée est laissée telle quelle) */
export async function vaultSealAll(){
  let n = 0;
  for (const k of SEALABLE){
    const raw = await rawGet(k);
    if (raw != null && raw !== '' && !isSealed(raw)){ await kvSet(k, raw); n++; }
  }
  return n;
}
/* désactivation : tout ré-écrire en clair AVANT d'effacer la
   métadonnée (interrompu = valeurs mixtes, toutes relisibles) */
export async function vaultOpenAll(){
  if (!vKey) throw new Error('verrou');
  let n = 0;
  for (const k of SEALABLE){
    const raw = await rawGet(k);
    if (raw != null && isSealed(raw)){ await rawSet(k, await openValue(vKey, k, raw)); n++; }
  }
  return n;
}
/* rotation (récupération, bannissement) : rechiffrer chaque valeur
   de l'ancienne clé vers la nouvelle, une par une. REPRENABLE : une
   valeur déjà sous la nouvelle clé (rotation interrompue puis
   reprise) est reconnue et laissée telle quelle — seule une valeur
   qu'aucune des deux clés n'ouvre est une vraie corruption. */
export async function vaultReseal(oldKey, newKey){
  let n = 0;
  for (const k of SEALABLE){
    const raw = await rawGet(k);
    if (raw == null || !isSealed(raw)) continue;
    let clear;
    try { clear = await openValue(oldKey, k, raw); }
    catch (e) {
      try { await openValue(newKey, k, raw); continue; }
      catch (e2) { throw new Error('coffre'); }
    }
    await rawSet(k, await sealValue(newKey, k, clear));
    n++;
  }
  vKey = newKey;
  return n;
}
export function getBackend(){ return backend; }

function idbReq(mode, fn){
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('noidb'));
    const open = indexedDB.open('oc_docs_v1', 1);
    open.onupgradeneeded = () => { open.result.createObjectStore('docs'); };
    open.onerror = () => rej(open.error || new Error('idb'));
    open.onsuccess = () => {
      const db = open.result;
      let rq;
      try { rq = fn(db.transaction('docs', mode).objectStore('docs')); }
      catch (e) { db.close(); return rej(e); }
      rq.onsuccess = () => { res(rq.result); db.close(); };
      rq.onerror = () => { rej(rq.error || new Error('idb')); db.close(); };
    };
  });
}
export const docGet = k => idbReq('readonly', s => s.get(k));
export const docPut = (k, v) => idbReq('readwrite', s => s.put(v, k));
export const docDel = k => idbReq('readwrite', s => s.delete(k));
