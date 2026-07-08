/* ============================================================
   OpenContact — moteur · stockage
   kv* : pistes / profil / journal — 3 niveaux (window.storage,
   localStorage, mémoire), l'interface lit getBackend() pour
   décider seule comment alerter. doc* : PDF (CV / lettre) dans
   IndexedDB, une base SÉPARÉE — un PDF lourd ne peut jamais
   bloquer ni faire perdre les pistes. Aucun accès au DOM.
   ============================================================ */

export const DATA_KEY = 'oc_data_v3';
export const PROFILE_KEY = 'oc_profile_v1';
export const JOURNAL_KEY = 'oc_journal_v1';
export const ORPHANS_KEY = 'oc_orphans_v1';   /* contacts « à rattacher » (sans entreprise) */
export const THEME_KEY = 'oc_theme';
export const VIEW_KEY = 'oc_view';
export const OLD_V2 = 'oc_data_v2';
export const OLD_V1 = 'ais_stage_targets_v1';

let backend = 'memory';
const mem = {};
export async function kvInit(){
  if (window.storage){
    try { await window.storage.set('oc_probe', '1'); backend = 'claude'; return; } catch (e) {}
  }
  try { localStorage.setItem('oc_probe', '1'); backend = 'local'; } catch (e) { backend = 'memory'; }
}
export async function kvGet(k){
  try {
    if (backend === 'claude'){ const r = await window.storage.get(k); return r ? r.value : null; }
    if (backend === 'local') return localStorage.getItem(k);
    return mem[k] ?? null;
  } catch (e) { return null; }
}
export async function kvSet(k, v){
  try {
    if (backend === 'claude'){ await window.storage.set(k, v); return true; }
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
