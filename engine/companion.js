/* ============================================================
   OpenContact — moteur · client du Compagnon (canal local)
   La PWA du même ordinateur découvre le Compagnon sur 127.0.0.1,
   s'y associe en prouvant le code court affiché par sa fenêtre,
   puis lui parle sous une clé de canal durable. Tout voyage en
   enveloppes `OCV1.` (engine/vault.js) : l'appairage sous la clé
   dérivée du code (PBKDF2, itérations partagées avec le cœur
   Rust), la suite sous la clé née de l'appairage. Rien d'utile
   en clair — un autre processus local n'obtient rien.
   Fonctions sans DOM ; le réseau échoue en erreurs courtes.
   ============================================================ */
import { b64ToBytes } from './crypto.js';
import { sealValue, openValue } from './vault.js';

export const COMPANION_PORTS = [17095, 17096, 17097];
export const PAIR_ITER = 120000;   /* = oc-coeur ITER_APPAIRAGE */

const te = () => new TextEncoder();

/* le code tapé, tolérant : casse, tirets, espaces — retapé au format
   d'affichage XXXX-XXXX de la fenêtre du Compagnon */
export function normCode(s){
  const v = String(s || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8);
  return v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v;
}

export async function pairKey(code, saltB64){
  const base = await crypto.subtle.importKey('raw',
    te().encode('code:' + normCode(code)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations: PAIR_ITER, hash: 'SHA-256' },
    base, 256);
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
const canalKey = kB64 =>
  crypto.subtle.importKey('raw', b64ToBytes(kB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

/* la découverte : le premier port qui répond en Compagnon */
export async function probeCompanion(){
  for (const port of COMPANION_PORTS){
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 900);
      const r = await fetch(`http://127.0.0.1:${port}/oc-compagnon`,
        { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (!r.ok) continue;
      const info = await r.json();
      if (info && info.v === 1) return { base: `http://127.0.0.1:${port}`, info };
    } catch (e) {}
  }
  return null;
}

/* l'appairage : le code prouvé chiffre l'échange d'identités ;
   la réponse porte la clé de canal durable */
export async function pairCompanion(base, code, saltB64, device, ring){
  const k = await pairKey(code, saltB64);
  const d = await sealValue(k, 'canal-appairage', JSON.stringify({ device, ring: ring || null }));
  const r = await fetch(base + '/appairage', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ d })
  });
  if (r.status === 403){
    const e = await r.json().catch(() => ({}));
    throw new Error(e.e === 'code' ? 'code' : 'ferme');
  }
  if (!r.ok) throw new Error('canal');
  const rep = JSON.parse(await openValue(k, 'canal-appairage', (await r.json()).d));
  if (!rep || !rep.k || !rep.compagnon) throw new Error('format');
  return rep;   /* { compagnon: {id, name, pub, role}, k } */
}

/* la conversation courante, sous la clé de canal */
export async function companionCall(base, kB64, msg){
  const k = await canalKey(kB64);
  const d = await sealValue(k, 'canal', JSON.stringify(msg));
  const r = await fetch(base + '/boite', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ d })
  });
  if (!r.ok) throw new Error('canal');
  return JSON.parse(await openValue(k, 'canal', (await r.json()).d));
}
