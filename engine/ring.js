/* ============================================================
   OpenContact — moteur · l'anneau d'appareils (appareil principal)
   Un registre signé qui voyage avec la sync : qui est dans le
   groupe, qui est l'appareil principal, quelles commandes sont
   en attente (verrouiller, retirer, effacer, transférer le rôle).
   · Chaque appareil a une identité Ed25519 (aléatoire).
   · L'anneau ENTIER est signé par l'appareil principal — les
     autres vérifient avec la clé publique du principal qu'ils
     connaissent déjà (premier anneau appris par le canal
     authentifié de la phrase de liaison).
   · La récupération d'urgence est signée par la CLÉ DE SECOURS,
     dérivée de la phrase de secours (Ed25519 déterministe) : un
     appareil qui prouve la phrase peut devenir principal, hors
     ligne, vérifiable par tous (D7).
   · Bannir incrémente la génération : un anneau plus ancien ne
     redescend jamais (le retour d'un banni est ignoré).
   Fonctions pures (l'état vit dans storage), aucun accès au DOM.
   Ed25519 absent (vieux navigateur) → l'appelant dégrade proprement.
   ============================================================ */
import { KDF_ITER, bytesToB64, b64ToBytes } from './crypto.js';
import { normVaultPhrase } from './vault.js';

export const RING_VERSION = 1;

/* ---------- Ed25519 (WebCrypto) ---------- */
export async function edAvailable(){
  try {
    await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign']);
    return true;
  } catch (e) { return false; }
}
/* PKCS#8 d'une graine brute de 32 octets (préfixe fixe RFC 8410) */
const PKCS8_PREFIX = new Uint8Array([48, 46, 2, 1, 0, 48, 5, 6, 3, 43, 101, 112, 4, 34, 4, 32]);
async function edFromSeed(seed){
  const pkcs8 = new Uint8Array(48);
  pkcs8.set(PKCS8_PREFIX, 0);
  pkcs8.set(seed, 16);
  const priv = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', priv);
  return { priv, pub: jwk.x };            /* x = clé publique (base64url) */
}
export async function makeDeviceKeys(){
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const k = await edFromSeed(seed);
  return { pub: k.pub, seed: bytesToB64(seed) };
}
async function privFromStored(seedB64){
  return (await edFromSeed(b64ToBytes(seedB64))).priv;
}
/* clé de secours : déterministe depuis la phrase (PBKDF2 → graine) */
export async function recoveryKeys(phrase, iter){
  const base = await crypto.subtle.importKey('raw',
    new TextEncoder().encode('recovery:' + normVaultPhrase(phrase)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode('oc-devring-v1'), iterations: iter || KDF_ITER, hash: 'SHA-256' },
    base, 256);
  const seed = new Uint8Array(bits);
  const k = await edFromSeed(seed);
  return { pub: k.pub, seed: bytesToB64(seed) };
}
async function pubKey(pubB64url){
  return crypto.subtle.importKey('jwk',
    { kty: 'OKP', crv: 'Ed25519', x: pubB64url }, { name: 'Ed25519' }, false, ['verify']);
}

/* ---------- forme canonique & signature ---------- */
function canon(ring){
  const devices = (ring.devices || []).slice()
    .sort((a, b) => a.id < b.id ? -1 : 1)
    .map(d => [d.id, d.name, d.pub, d.role, d.addedAt || 0]);
  const cmds = (ring.cmds || []).slice()
    .sort((a, b) => a.cid < b.cid ? -1 : 1)
    .map(c => [c.cid, c.cmd, c.target, c.t || 0]);
  return JSON.stringify([RING_VERSION, ring.gen, ring.seq || 0, ring.main, ring.recovery, devices, cmds, ring.updatedAt]);
}
async function signRing(ring, privSeed){
  const priv = await privFromStored(privSeed);
  const sig = await crypto.subtle.sign('Ed25519', priv, new TextEncoder().encode(canon(ring)));
  return Object.assign({}, ring, { sig: bytesToB64(new Uint8Array(sig)) });
}
export async function verifyRing(ring, pubB64url){
  if (!ring || !ring.sig || !pubB64url) return false;
  try {
    return await crypto.subtle.verify('Ed25519', await pubKey(pubB64url),
      b64ToBytes(ring.sig), new TextEncoder().encode(canon(ring)));
  } catch (e) { return false; }
}

/* signature générique d'un texte par une graine d'appareil — les
   missions du Compagnon voyagent signées ainsi (engine/mission.js),
   et le cœur Rust vérifie les mêmes octets */
export async function edSign(seedB64, text){
  const priv = await privFromStored(seedB64);
  const sig = await crypto.subtle.sign('Ed25519', priv, new TextEncoder().encode(String(text)));
  return bytesToB64(new Uint8Array(sig));
}
export async function edVerify(pubB64url, sigB64, text){
  try {
    return await crypto.subtle.verify('Ed25519', await pubKey(pubB64url),
      b64ToBytes(sigB64), new TextEncoder().encode(String(text)));
  } catch (e) { return false; }
}

/* ---------- cycle de vie ---------- */
export const mainOf = ring => (ring.devices || []).find(d => d.id === ring.main) || null;
export const deviceIn = (ring, id) => (ring.devices || []).find(d => d.id === id) || null;

/* création : cet appareil devient le principal */
export async function ringInit(self, selfPub, privSeed, recoveryPub){
  const ring = {
    v: RING_VERSION, gen: 1, seq: 1, main: self.id, recovery: recoveryPub,
    devices: [{ id: self.id, name: self.name, pub: selfPub, role: 'main', addedAt: Date.now() }],
    cmds: [], updatedAt: Date.now()
  };
  return signRing(ring, privSeed);
}
/* le principal ajoute un appareil vu sur le canal authentifié */
export async function ringAddDevice(ring, privSeed, dev){
  if (deviceIn(ring, dev.id)) return ring;
  const out = Object.assign({}, ring, {
    devices: ring.devices.concat([{ id: dev.id, name: String(dev.name || 'Appareil').slice(0, 40),
      pub: dev.pub, role: dev.role === 'companion' ? 'companion' : 'member', addedAt: Date.now() }]),
    seq: (ring.seq || 0) + 1, updatedAt: Date.now()
  });
  return signRing(out, privSeed);
}
/* une commande signée : lock | remove | ban | wipe
   remove/ban retirent aussi l'appareil ; ban incrémente la génération */
export async function ringCommand(ring, privSeed, cmd, target, cid){
  const out = Object.assign({}, ring, {
    cmds: ring.cmds.concat([{ cid: cid || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
      cmd, target, t: Date.now() }]).slice(-40),
    seq: (ring.seq || 0) + 1, updatedAt: Date.now()
  });
  if (cmd === 'remove' || cmd === 'ban' || cmd === 'wipe')
    out.devices = ring.devices.filter(d => d.id !== target);
  if (cmd === 'ban') out.gen = ring.gen + 1;
  return signRing(out, privSeed);
}
/* transfert du rôle — signé par l'ANCIEN principal */
export async function ringTransfer(ring, privSeed, newMainId){
  if (!deviceIn(ring, newMainId)) throw new Error('inconnu');
  const out = Object.assign({}, ring, {
    main: newMainId,
    devices: ring.devices.map(d => Object.assign({}, d,
      { role: d.id === newMainId ? 'main' : (d.role === 'main' ? 'member' : d.role) })),
    seq: (ring.seq || 0) + 1, updatedAt: Date.now()
  });
  return signRing(out, privSeed);
}
/* récupération d'urgence : signée par la clé de SECOURS (preuve de la
   phrase), génération incrémentée, nouveau principal, nouvelle clé de
   secours (celle de la nouvelle phrase) — l'ancien principal est écarté */
export async function ringRecover(ring, oldRecoverySeed, self, selfPub, newRecoveryPub){
  const kept = (ring.devices || []).filter(d => d.id !== ring.main && d.id !== self.id);
  const out = {
    v: RING_VERSION, gen: ring.gen + 1, seq: 1, main: self.id, recovery: newRecoveryPub,
    devices: [{ id: self.id, name: self.name, pub: selfPub, role: 'main', addedAt: Date.now() }]
      .concat(kept.map(d => Object.assign({}, d, { role: d.role === 'main' ? 'member' : d.role }))),
    cmds: (ring.cmds || []).slice(-20), updatedAt: Date.now()
  };
  return signRing(out, oldRecoverySeed);
}

/* ---------- fusion à la réception ----------
   mine peut être null (premier anneau appris — TOFU sur le canal
   authentifié par la phrase de liaison).
   Retour : { ring, changed, recovered } — jamais de rétrogradation. */
export async function mergeRing(mine, incoming){
  if (!incoming || incoming.v !== RING_VERSION || !incoming.main) return { ring: mine, changed: false };
  if (!mine){
    const m = deviceIn(incoming, incoming.main);
    if (m && await verifyRing(incoming, m.pub)) return { ring: incoming, changed: true, recovered: false };
    return { ring: mine, changed: false };
  }
  if ((incoming.gen || 0) < mine.gen) return { ring: mine, changed: false };
  const myMain = mainOf(mine);
  /* chemin normal : signé par le principal que je connais.
     Le départage est le compteur signé `seq` (monotone par signeur),
     jamais l'horloge — deux signatures dans la même milliseconde
     restent ordonnées. */
  if (myMain && await verifyRing(incoming, myMain.pub)){
    if (incoming.gen > mine.gen ||
        (incoming.gen === mine.gen && (incoming.seq || 0) > (mine.seq || 0)))
      return { ring: incoming, changed: true, recovered: false };
    return { ring: mine, changed: false };
  }
  /* chemin de secours : signé par la clé de secours, génération STRICTEMENT
     supérieure — quelqu'un a prouvé la phrase de secours */
  if (mine.recovery && incoming.gen > mine.gen && await verifyRing(incoming, mine.recovery))
    return { ring: incoming, changed: true, recovered: true };
  return { ring: mine, changed: false };
}

/* les actions qui me visent et que je n'ai pas encore appliquées.
   Être absent de l'anneau (alors que j'y étais) vaut « remove ». */
export function actionsFor(ring, selfId, applied){
  const done = new Set(applied || []);
  const acts = [];
  for (const c of (ring.cmds || [])){
    if (c.target !== selfId || done.has(c.cid)) continue;
    acts.push({ cid: c.cid, cmd: c.cmd });
  }
  return acts;
}
