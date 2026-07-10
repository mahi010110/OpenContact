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
   Aucun accès au DOM.
   ============================================================ */

export const DATA_KEY = 'oc_data_v3';
export const PROFILE_KEY = 'oc_profile_v1';
export const JOURNAL_KEY = 'oc_journal_v1';
export const ORPHANS_KEY = 'oc_orphans_v1';   /* contacts « à rattacher » (sans entreprise) */
export const TOMBS_KEY = 'oc_tombs_v1';       /* suppressions (tombstones) — pour la sync appareils */
export const SYNC_KEY = 'oc_sync_v1';         /* phrase de liaison de MES appareils */
export const RELAYS_KEY = 'oc_relays_v1';     /* relais P2P personnalisés (optionnel) */
export const DEVICE_KEY = 'oc_device_v1';     /* cet appareil : {id, name} */
export const DEVICES_KEY = 'oc_devices_v1';   /* appareils reliés déjà vus : [{id, name, seen}] */
export const PROMO_KEY = 'oc_promo_v1';       /* dernier mot de passe de salle de promo */
export const THEME_KEY = 'oc_theme';
export const VIEW_KEY = 'oc_view';
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
function kvIdbReq(mode, fn){
  return new Promise((res, rej) => {
    let rq;
    try { rq = fn(kvDb.transaction('kv', mode).objectStore('kv')); }
    catch (e) { return rej(e); }
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error || new Error('idb'));
  });
}

export async function kvInit(){
  if (window.storage){
    try { await window.storage.set('oc_probe', '1'); backend = 'claude'; return; } catch (e) {}
  }
  try {
    kvDb = await kvOpenIdb();
    await kvIdbReq('readwrite', s => s.put('1', 'oc_probe'));
    backend = 'idb';
    return;
  } catch (e) { kvDb = null; }
  try { localStorage.setItem('oc_probe', '1'); backend = 'local'; } catch (e) { backend = 'memory'; }
}
export async function kvGet(k){
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
export async function kvSet(k, v){
  try {
    if (backend === 'claude'){ await window.storage.set(k, v); return true; }
    if (backend === 'idb'){ await kvIdbReq('readwrite', s => s.put(v, k)); return true; }
    if (backend === 'local'){ localStorage.setItem(k, v); return true; }
    mem[k] = v; return false;
  } catch (e) { return false; }
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
