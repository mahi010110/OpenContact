/* ============================================================
   OpenContact — moteur · échange (.oc et QR)
   Lecture des fichiers reçus (OC2 chiffré, OC1 hérité, OCQ1
   compact pour QR, JSON), vue communautaire SANS données privées,
   enveloppes d'export. C'est ici — et seulement ici — que vivent
   les formats .oc et OCQ1.
   ============================================================ */
import { decryptOC2, unsealOC1, bytesToB64, b64ToBytes } from './crypto.js';
import { APP_VERSION } from './model.js';

export function communityView(c){
  const out = {
    name: c.name, city: c.city, domain: c.domain, desc: c.desc, address: c.address,
    website: c.website, techs: c.techs, positions: c.positions, process: c.process, tips: c.tips,
    contacts: (c.contacts || []).map(t => {
      const ct = { name: t.name, role: t.role, email: t.email, phone: t.phone, link: t.link, note: t.note, conf: t.conf };
      if (t.extra) ct.extra = t.extra;
      return ct;
    }),
    lat: c.lat, lng: c.lng, verifiedAt: c.verifiedAt, confirmations: c.confirmations, updatedAt: c.updatedAt
  };
  if (c.extra) out.extra = c.extra;
  return out;
}
/* ---------- OCQ1 : encodage compact pour QR ----------
   Payload « share » compressé (deflate-raw natif) puis base64url :
   ~5 pistes tiennent dans un QR. Si l'API de compression manque
   (très vieux navigateur), l'appelant replie vers le fichier .oc. */
const b64url = u8 => bytesToB64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function b64urlToBytes(s){
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return b64ToBytes(s);
}
export async function encodeOCQ(list){
  if (typeof CompressionStream === 'undefined') throw new Error('noqr');
  const json = new TextEncoder().encode(JSON.stringify(sharePayload(list)));
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'OCQ1.' + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}
export async function decodeOCQ(compact){
  if (typeof DecompressionStream === 'undefined') throw new Error('noqr');
  const bytes = b64urlToBytes(String(compact).slice(5));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  try { return JSON.parse(await new Response(stream).text()); }
  catch (e) { throw new Error('format'); }
}

export async function parseInput(raw, pass){
  const s = String(raw || '').trim();
  if (!s) throw new Error('vide');
  if (s.length > 4000000) throw new Error('troplourd');          /* D4 */
  const compact = s.replace(/\s+/g, '');
  let obj;
  if (compact.startsWith('OC2.')){
    if (!pass) throw new Error('besoinpass');
    obj = await decryptOC2(compact, pass);
  } else if (compact.startsWith('OC1.')){
    obj = unsealOC1(compact);
  } else if (compact.startsWith('OCQ1.')){
    obj = await decodeOCQ(compact);
  } else {
    obj = JSON.parse(s);
  }
  if (Array.isArray(obj)) obj = { companies: obj };
  if (!obj || !Array.isArray(obj.companies)) throw new Error('format');
  obj.companies = obj.companies.filter(x => x && typeof x === 'object' && x.name);
  if (obj.companies.length > 2000) throw new Error('tropdepistes'); /* D4 */
  return obj;
}
/* enveloppes d'export : « share » ne contient jamais le privé (communityView),
   « full » est la sauvegarde personnelle complète (+ contacts à rattacher
   s'il y en a — champ optionnel, ignoré sans casse par les vieux lecteurs) */
export function sharePayload(list){
  return { v: 4, app: APP_VERSION, kind: 'share', companies: list.map(communityView) };
}
export function fullPayload(companies, profile, orphans){
  const out = { v: 4, app: APP_VERSION, kind: 'full', profile, companies };
  if (Array.isArray(orphans) && orphans.length) out.orphans = orphans;
  return out;
}
