/* ============================================================
   OpenContact — moteur · le coffre (profil protégé)
   Une clé maîtresse (AES-GCM 256, aléatoire) chiffre les valeurs
   sensibles du stockage. Elle n'est jamais écrite : elle vit en
   mémoire une fois le coffre déverrouillé, et repose enveloppée
   (wrap AES-GCM sous une clé dérivée) dans la métadonnée
   `oc_vault_v1` — une enveloppe par moyen d'accès :
   · code (PIN)          → PBKDF2-SHA256, itérations stockées ;
   · phrase de secours   → 12 mots de la liste, PBKDF2 idem ;
   · secret PRF          → octets WebAuthn (HKDF-SHA256) — le
     navigateur fournit le secret, le moteur n'appelle jamais
     l'API d'authentification lui-même.
   Chaque valeur scellée : `OCV1.<iv>.<chiffré>` (AES-GCM sous la
   clé maîtresse, AAD = nom de la clé de stockage — une enveloppe
   ne peut pas être rejouée sous un autre nom).
   Fonctions pures, aucun accès au DOM. Le hasard est injectable
   (`rnd`) pour des vecteurs de test stables.
   ============================================================ */
import { KDF_ITER, bytesToB64, b64ToBytes } from './crypto.js';

export const VAULT_VERSION = 1;
export const PIN_LEN = 6;
export const PHRASE_LEN = 12;

/* ---------- la liste des mots (phrase de secours) ----------
   256 mots français sans accent, courts, distincts — 12 mots
   tirés au hasard ≈ 96 bits d'entropie, renforcés par PBKDF2.
   NE JAMAIS réordonner ni retirer un mot : les phrases déjà
   remises doivent rester valides. Ajouter = nouvelle version. */
export const VAULT_WORDS = [
  'aigle', 'ancre', 'avion', 'balai', 'balle', 'bambou', 'banane', 'barque',
  'bassin', 'bateau', 'biche', 'bijou', 'bison', 'blouse', 'bocal', 'bouton',
  'branche', 'brise', 'brume', 'buisson', 'bureau', 'cabane', 'cactus', 'cadre',
  'caillou', 'calme', 'canard', 'carte', 'casque', 'castor', 'ceinture', 'cerise',
  'chaise', 'chameau', 'champ', 'chanson', 'chapeau', 'charbon', 'chaton', 'cheval',
  'chien', 'chiffre', 'citron', 'clavier', 'cloche', 'clou', 'cobra', 'coffre',
  'colline', 'colonne', 'comete', 'compas', 'coquille', 'corde', 'corbeau', 'costume',
  'coton', 'coude', 'courbe', 'crabe', 'crayon', 'crochet', 'cuisine', 'cygne',
  'dauphin', 'dessin', 'disque', 'domino', 'dossier', 'douche', 'dragon', 'drapeau',
  'dune', 'eclair', 'ecole', 'ecorce', 'ecran', 'eponge', 'epaule', 'erable',
  'escalier', 'espace', 'etoile', 'faucon', 'fenetre', 'ferme', 'feuille', 'ficelle',
  'figue', 'filet', 'flamme', 'fleche', 'fleuve', 'flocon', 'foret', 'fontaine',
  'forgeron', 'fourmi', 'fraise', 'fromage', 'fumee', 'fusee', 'galet', 'gant',
  'garage', 'gazon', 'geste', 'girafe', 'givre', 'glace', 'gorille', 'goutte',
  'graine', 'grange', 'grenier', 'griffe', 'grotte', 'grue', 'guitare', 'hamac',
  'hangar', 'herbe', 'heron', 'hibou', 'histoire', 'hiver', 'horloge', 'humble',
  'iguane', 'jaguar', 'jardin', 'jetee', 'jouet', 'journal', 'jument', 'jungle',
  'kayak', 'koala', 'lagune', 'lampe', 'lapin', 'lettre', 'levier', 'lezard',
  'liane', 'lierre', 'lievre', 'lilas', 'limace', 'livre', 'losange', 'loutre',
  'lueur', 'lumiere', 'lutin', 'madrier', 'maison', 'manche', 'marbre', 'marche',
  'marin', 'marteau', 'menthe', 'mesange', 'metal', 'meteore', 'miroir', 'moineau',
  'montagne', 'morse', 'moteur', 'moulin', 'mousse', 'muret', 'musique', 'naval',
  'navire', 'neige', 'nuage', 'ocean', 'oiseau', 'ombre', 'onde', 'orage',
  'orange', 'orgue', 'ortie', 'otarie', 'ourson', 'outil', 'palmier', 'panda',
  'panier', 'papier', 'parfum', 'passage', 'pastel', 'patte', 'paume', 'pelle',
  'pendule', 'perle', 'persil', 'phare', 'pierre', 'pigeon', 'pinceau', 'piste',
  'placard', 'plage', 'plaine', 'planche', 'plume', 'poche', 'pomme', 'pont',
  'portail', 'poste', 'poterie', 'poulie', 'prairie', 'prisme', 'projet', 'prune',
  'puits', 'pupitre', 'quartz', 'quille', 'racine', 'radeau', 'rameau', 'rampe',
  'ravin', 'rayon', 'recolte', 'refuge', 'renard', 'requin', 'rivage', 'riviere',
  'rocher', 'roseau', 'rosee', 'roue', 'ruban', 'ruche', 'ruelle', 'sable',
  'sapin', 'saule', 'savane', 'sentier', 'sirop', 'socle', 'soleil', 'sommet'
];

/* normalisation d'une phrase tapée : minuscules, accents retirés,
   espaces multiples réduits — tolérante à la saisie mobile */
export function normVaultPhrase(s){
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim();
}
/* les mots inconnus d'une phrase tapée (aide à la correction) */
export function phraseUnknownWords(s){
  const set = new Set(VAULT_WORDS);
  return normVaultPhrase(s).split(' ').filter(w => w && !set.has(w));
}
const defaultRnd = n => crypto.getRandomValues(new Uint8Array(n));
export function makeVaultPhrase(rnd){
  const r = (rnd || defaultRnd)(PHRASE_LEN);
  const out = [];
  for (let i = 0; i < PHRASE_LEN; i++) out.push(VAULT_WORDS[r[i] & 255]);
  return out.join(' ');
}

/* ---------- dérivations ---------- */
const te = () => new TextEncoder();
async function kekFromSecretText(text, salt, iter){
  const base = await crypto.subtle.importKey('raw', te().encode(text), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function kekFromSecretBytes(bytes, salt){
  const base = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', salt, info: te().encode('oc-vault-prf-v1'), hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const clampIter = it => Math.min(Math.max(parseInt(it, 10) || 0, 10000), 2000000);

/* ---------- enveloppes de la clé maîtresse ---------- */
async function wrapMaster(kek, mkBytes, iv, aadTxt){
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: te().encode(aadTxt) }, kek, mkBytes));
  return { i: bytesToB64(iv), c: bytesToB64(ct) };
}
async function unwrapMaster(kek, wrap, aadTxt){
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(wrap.i), additionalData: te().encode(aadTxt) },
    kek, b64ToBytes(wrap.c));
  return new Uint8Array(pt);
}
const importMaster = bytes =>
  crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

async function makePinWrap(pin, mkBytes, iter, rnd){
  const salt = rnd(16);
  const kek = await kekFromSecretText('pin:' + String(pin), salt, iter);
  const w = await wrapMaster(kek, mkBytes, rnd(12), 'oc-vault-pin');
  return { it: iter, s: bytesToB64(salt), i: w.i, c: w.c };
}
async function makePhraseWrap(phrase, mkBytes, iter, rnd){
  const salt = rnd(16);
  const kek = await kekFromSecretText('phrase:' + normVaultPhrase(phrase), salt, iter);
  const w = await wrapMaster(kek, mkBytes, rnd(12), 'oc-vault-phrase');
  return { it: iter, s: bytesToB64(salt), i: w.i, c: w.c };
}

/* ---------- cycle de vie du coffre ----------
   `meta` est l'objet stocké sous oc_vault_v1 :
   { v, gen, at, wraps: { pin, phrase, prf? } }
   Le retour « déverrouillé » est un descripteur { key, gen } —
   key est une CryptoKey non extractible pour les valeurs ;
   les octets maîtres ne sortent jamais de ce module. */
export async function createVault(pin, phrase, opts){
  opts = opts || {};
  const rnd = opts.rnd || defaultRnd;
  const iter = clampIter(opts.iter || KDF_ITER);
  const mk = rnd(32);
  const meta = {
    v: VAULT_VERSION, gen: 1, at: opts.at || Date.now(),
    wraps: {
      pin: await makePinWrap(pin, mk, iter, rnd),
      phrase: await makePhraseWrap(phrase, mk, iter, rnd)
    }
  };
  const key = await importMaster(mk);
  mk.fill(0);
  return { meta, key };
}
export async function unlockWithPin(meta, pin){
  const w = meta && meta.wraps && meta.wraps.pin;
  if (!w) throw new Error('format');
  const kek = await kekFromSecretText('pin:' + String(pin), b64ToBytes(w.s), clampIter(w.it));
  let mk;
  try { mk = await unwrapMaster(kek, w, 'oc-vault-pin'); }
  catch (e) { throw new Error('code'); }
  const key = await importMaster(mk);
  mk.fill(0);
  return { key, gen: meta.gen };
}
export async function unlockWithPhrase(meta, phrase){
  const w = meta && meta.wraps && meta.wraps.phrase;
  if (!w) throw new Error('format');
  const kek = await kekFromSecretText('phrase:' + normVaultPhrase(phrase), b64ToBytes(w.s), clampIter(w.it));
  let mk;
  try { mk = await unwrapMaster(kek, w, 'oc-vault-phrase'); }
  catch (e) { throw new Error('phrase'); }
  const key = await importMaster(mk);
  mk.fill(0);
  return { key, gen: meta.gen };
}
export async function unlockWithPrf(meta, secretBytes){
  const w = meta && meta.wraps && meta.wraps.prf;
  if (!w) throw new Error('format');
  const kek = await kekFromSecretBytes(secretBytes, b64ToBytes(w.s));
  let mk;
  try { mk = await unwrapMaster(kek, w, 'oc-vault-prf'); }
  catch (e) { throw new Error('secret'); }
  const key = await importMaster(mk);
  mk.fill(0);
  return { key, gen: meta.gen };
}

/* re-envelopper : ces gestes exigent un moyen d'accès existant
   (jamais la clé seule — on re-prouve le secret, pas la session) */
export async function setPin(meta, currentAccess, newPin, opts){
  const mk = await proveAccess(meta, currentAccess);
  const rnd = (opts && opts.rnd) || defaultRnd;
  const iter = clampIter((opts && opts.iter) || KDF_ITER);
  const out = JSON.parse(JSON.stringify(meta));
  out.wraps.pin = await makePinWrap(newPin, mk, iter, rnd);
  mk.fill(0);
  return out;
}
export async function addPrfWrap(meta, currentAccess, secretBytes, credId, opts){
  const mk = await proveAccess(meta, currentAccess);
  const rnd = (opts && opts.rnd) || defaultRnd;
  const salt = rnd(16);
  const kek = await kekFromSecretBytes(secretBytes, salt);
  const w = await wrapMaster(kek, mk, rnd(12), 'oc-vault-prf');
  mk.fill(0);
  const out = JSON.parse(JSON.stringify(meta));
  out.wraps.prf = { id: String(credId || ''), s: bytesToB64(salt), i: w.i, c: w.c };
  return out;
}
export function removePrfWrap(meta){
  const out = JSON.parse(JSON.stringify(meta));
  delete out.wraps.prf;
  return out;
}
/* un moyen d'accès : { pin } | { phrase } | { prf: Uint8Array } */
async function proveAccess(meta, access){
  if (access && typeof access.pin === 'string'){
    const w = meta.wraps.pin;
    const kek = await kekFromSecretText('pin:' + access.pin, b64ToBytes(w.s), clampIter(w.it));
    try { return await unwrapMaster(kek, w, 'oc-vault-pin'); }
    catch (e) { throw new Error('code'); }
  }
  if (access && typeof access.phrase === 'string'){
    const w = meta.wraps.phrase;
    const kek = await kekFromSecretText('phrase:' + normVaultPhrase(access.phrase), b64ToBytes(w.s), clampIter(w.it));
    try { return await unwrapMaster(kek, w, 'oc-vault-phrase'); }
    catch (e) { throw new Error('phrase'); }
  }
  if (access && access.prf){
    const w = meta.wraps.prf;
    if (!w) throw new Error('format');
    const kek = await kekFromSecretBytes(access.prf, b64ToBytes(w.s));
    try { return await unwrapMaster(kek, w, 'oc-vault-prf'); }
    catch (e) { throw new Error('secret'); }
  }
  throw new Error('format');
}

/* rotation complète (récupération d'urgence, bannissement) :
   NOUVELLE clé maîtresse, nouveau code, nouvelle phrase, génération
   incrémentée. L'appelant rechiffre les valeurs de l'ancienne clé
   vers la nouvelle (voir storage.vaultReseal). */
export async function rotateVault(meta, newPin, newPhrase, opts){
  opts = opts || {};
  const made = await createVault(newPin, newPhrase, opts);
  made.meta.gen = ((meta && meta.gen) || 0) + 1;
  made.meta.at = opts.at || Date.now();
  return made;
}

/* rotation REPRENABLE : la nouvelle métadonnée embarque l'ancienne
   clé maîtresse scellée SOUS LA NOUVELLE (`prev`). Ordre imposé à
   l'appelant : écrire la métadonnée d'abord (point de non-retour :
   les anciens secrets ne déverrouillent plus), re-sceller ensuite,
   retirer `prev` à la fin (clearPrev). Interrompue n'importe où :
   au prochain déverrouillage, prevKeyOf rouvre l'ancienne clé avec
   la nouvelle et le re-scellement reprend — aucune valeur perdue. */
export const PREV_NAME = '__vault_prev__';
export async function rotateVaultResumable(meta, access, newPin, newPhrase, opts){
  const oldMk = await proveAccess(meta, access);
  const made = await rotateVault(meta, newPin, newPhrase, opts);
  made.meta.prev = await sealValue(made.key, PREV_NAME, bytesToB64(oldMk), opts && opts.rnd);
  const oldKey = await importMaster(oldMk);
  oldMk.fill(0);
  return { meta: made.meta, key: made.key, oldKey };
}
export async function prevKeyOf(meta, key){
  if (!meta || !meta.prev) return null;
  const b64 = await openValue(key, PREV_NAME, meta.prev);
  return importMaster(b64ToBytes(b64));
}
export function clearPrev(meta){
  const out = JSON.parse(JSON.stringify(meta));
  delete out.prev;
  return out;
}

/* ---------- valeurs scellées : OCV1.<iv>.<chiffré> ---------- */
export const isSealed = s => typeof s === 'string' && s.startsWith('OCV1.');
export async function sealValue(key, name, str, rnd){
  const iv = (rnd || defaultRnd)(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: te().encode('OCV1|' + name) },
    key, te().encode(String(str))));
  return 'OCV1.' + bytesToB64(iv) + '.' + bytesToB64(ct);
}
export async function openValue(key, name, env){
  const p = String(env).split('.');
  if (p[0] !== 'OCV1' || p.length !== 3) throw new Error('format');
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(p[1]), additionalData: te().encode('OCV1|' + name) },
      key, b64ToBytes(p[2]));
    return new TextDecoder().decode(pt);
  } catch (e) { throw new Error('coffre'); }
}
