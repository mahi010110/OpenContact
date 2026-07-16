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
export const OCQ_OUT_MAX = 4000000;   /* octets décompressés : même borne que l'entrée (D4) */
export async function decodeOCQ(compact){
  if (typeof DecompressionStream === 'undefined') throw new Error('noqr');
  const bytes = b64urlToBytes(String(compact).slice(5));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  /* lecture bornée : un blob de quelques Ko peut gonfler en Go
     (bombe de décompression) — au-delà de la borne, on refuse */
  const reader = stream.getReader();
  const parts = [];
  let size = 0;
  try {
    for (;;){
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > OCQ_OUT_MAX){
        reader.cancel().catch(() => {});
        throw new Error('troplourd');
      }
      parts.push(value);
    }
  } catch (e) {
    throw new Error(e.message === 'troplourd' ? 'troplourd' : 'format');
  }
  try { return JSON.parse(await new Blob(parts).text()); }
  catch (e) { throw new Error('format'); }
}

/* ---------- OCR1 : QR de rendez-vous (appairage P2P) ----------
   Le QR ne porte pas les données : un petit code de rendez-vous,
   typable sans caméra. Les deux appareils dérivent la même salle
   P2P éphémère du code (préfixe de salle « give- », données
   chiffrées de pair à pair par le code lui-même) et les fiches
   passent par la connexion — toujours en vue communautaire
   (sharePayload), jamais le privé. Un lecteur ancien ignore ce
   préfixe sans casse ; le repli hors ligne reste OCQ1/OCQP et le
   fichier .oc. */
const RDV_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';   /* sans i, l, o, 0, 1 */
export function makeRdvCode(){
  const u = crypto.getRandomValues(new Uint8Array(10));
  const c = i => RDV_ABC[u[i] % RDV_ABC.length];
  return [0, 1, 2, 3, 4].map(c).join('') + '-' + [5, 6, 7, 8, 9].map(c).join('');
}
/* code tapé ou lu → forme canonique (minuscules, sans séparateurs) */
export function rdvNorm(txt){
  const s = String(txt || '').toLowerCase().split('').filter(ch => RDV_ABC.includes(ch)).join('');
  return (s.length >= 8 && s.length <= 24) ? s : '';
}
export const rdvWrap = code => 'OCR1.' + code;
/* lecture d'un QR : rend le code canonique, ou null si ce n'en est pas un */
export function rdvParse(raw){
  const s = String(raw || '').trim();
  if (!/^OCR1\./i.test(s)) return null;
  return rdvNorm(s.slice(5)) || null;
}

/* ---------- OCQP : QR animé (multi-parties) ----------
   Quand l'OCQ1 déborde d'un QR lisible, la chaîne complète est découpée
   en tranches « OCQP.<i>.<n>.<tranche> » (i de 1 à n) que l'émetteur fait
   défiler ; le lecteur réassemble dans n'importe quel ordre puis relit
   l'OCQ1 obtenu. Plus aucune limite pratique au nombre de fiches,
   toujours hors ligne. Préfixe inconnu des vieux lecteurs = ignoré. */
export const OCQP_CHUNK = 800;     /* caractères par tranche : QR dense mais net */
export const OCQP_MAX = 512;       /* garde-fou : au-delà, c'est un fichier */
export function splitOCQ(ocq, size){
  size = size || OCQP_CHUNK;
  ocq = String(ocq);
  if (ocq.length <= size) return [ocq];
  const n = Math.ceil(ocq.length / size);
  return Array.from({ length: n }, (_, i) =>
    'OCQP.' + (i + 1) + '.' + n + '.' + ocq.slice(i * size, (i + 1) * size));
}
/* réassembleur : nourrir avec chaque lecture ; rend null si ce n'est pas
   une tranche OCQP, sinon { done, got, total, text } */
export function makeOCQJoiner(){
  let total = 0;
  let parts = {};
  return raw => {
    const m = /^OCQP\.(\d+)\.(\d+)\./.exec(String(raw || ''));
    if (!m) return null;
    const i = +m[1], n = +m[2];
    if (n < 2 || i < 1 || i > n || n > OCQP_MAX) return null;
    if (total && n !== total){ total = 0; parts = {}; }   /* autre séquence : on repart */
    total = n;
    parts[i] = String(raw).slice(m[0].length);
    const got = Object.keys(parts).length;
    const done = got === n;
    return { done, got, total: n,
             text: done ? Array.from({ length: n }, (_, k) => parts[k + 1]).join('') : '' };
  };
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
   « full » est la sauvegarde personnelle complète (+ champs optionnels
   `orphans` et `tombs`, ignorés sans casse par les vieux lecteurs) */
export function sharePayload(list){
  return { v: 4, app: APP_VERSION, kind: 'share', companies: list.map(communityView) };
}
export function fullPayload(companies, profile, orphans, tombs){
  const out = { v: 4, app: APP_VERSION, kind: 'full', profile, companies };
  if (Array.isArray(orphans) && orphans.length) out.orphans = orphans;
  if (Array.isArray(tombs) && tombs.length) out.tombs = tombs;
  return out;
}
