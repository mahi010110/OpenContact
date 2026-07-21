/* ============================================================
   OpenContact — tests de bout en bout · relais Nostr LOCAL
   Un vrai relais NIP-01 minimal (EVENT / REQ / CLOSE / EOSE / OK),
   serveur WebSocket RFC 6455 écrit à la main — zéro dépendance,
   comme tout l'outillage. Il permet de jouer la chaîne P2P entière
   (bibliothèque → WebSocket → découverte → WebRTC → transfert)
   avec deux vrais navigateurs, sans dépendre des relais publics.
   Rien ici n'est chargé par l'application.
   En `tls: true`, le relais parle wss:// avec un certificat
   auto-signé jetable (généré par openssl à la volée) : la CSP de
   l'application n'autorise que wss:, et le contexte de test passe
   `ignoreHTTPSErrors` pour l'accepter.
   ============================================================ */
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/* certificat auto-signé jetable pour 127.0.0.1 — test uniquement */
async function throwawayCert(){
  const dir = await mkdtemp(path.join(os.tmpdir(), 'oc-relais-'));
  const key = path.join(dir, 'k.pem');
  const cert = path.join(dir, 'c.pem');
  await promisify(execFile)('openssl', ['req', '-x509', '-newkey', 'ec',
    '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-keyout', key, '-out', cert,
    '-days', '2', '-nodes', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1']);
  const out = { key: await readFile(key), cert: await readFile(cert) };
  await rm(dir, { recursive: true, force: true });
  return out;
}

/* ---- trames RFC 6455 : encoder (serveur → client, sans masque) ---- */
function encodeFrame(opcode, payload){
  const len = payload.length;
  let head;
  if (len < 126){
    head = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536){
    head = Buffer.alloc(4);
    head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

/* ---- trames RFC 6455 : décoder au fil de l'eau (client → serveur) ---- */
function makeDecoder(onText, onClose, onPing){
  let buf = Buffer.alloc(0);
  let fragments = null;   /* message fragmenté en cours (opcode 0) */
  return chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;){
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126){
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2); off = 4;
      } else if (len === 127){
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > 16n * 1024n * 1024n){ onClose(); return; }   /* jamais un Go en mémoire */
        len = Number(big); off = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) return;
      let payload = buf.subarray(off + maskLen, off + maskLen + len);
      if (masked){
        const mask = buf.subarray(off, off + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      buf = buf.subarray(off + maskLen + len);
      if (opcode === 8){ onClose(); return; }
      if (opcode === 9){ onPing(payload); continue; }
      if (opcode === 10) continue;                        /* pong : ignoré */
      if (opcode === 1 || opcode === 2 || opcode === 0){
        if (opcode !== 0 && !fin){ fragments = [payload]; continue; }
        if (opcode === 0){
          if (!fragments) continue;
          fragments.push(payload);
          if (!fin) continue;
          payload = Buffer.concat(fragments); fragments = null;
        }
        onText(payload.toString('utf8'));
      }
    }
  };
}

/* ---- le relais : NIP-01 réduit à ce que Trystero utilise ---- */
export async function startLocalRelay({ silent = true, tls = false, port = 0 } = {}){
  const conns = new Set();          /* { sock, send, subs: Map<subId, filtres[]> } */
  const log = (...a) => { if (!silent) console.log('[relais]', ...a); };

  const matches = (ev, f) => {
    if (f.kinds && !f.kinds.includes(ev.kind)) return false;
    if (typeof f.since === 'number' && ev.created_at < f.since - 60) return false;
    if (f['#x']){
      const topics = (ev.tags || []).filter(t => t[0] === 'x').map(t => t[1]);
      if (!topics.some(t => f['#x'].includes(t))) return false;
    }
    return true;
  };

  const server = tls
    ? https.createServer(await throwawayCert(), (req, res) => { res.writeHead(426); res.end(); })
    : http.createServer((req, res) => { res.writeHead(426); res.end(); });
  server.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'];
    if (!key){ sock.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n' +
      'Connection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    const conn = {
      sock,
      subs: new Map(),
      send: obj => { try { sock.write(encodeFrame(1, Buffer.from(JSON.stringify(obj)))); } catch (e) {} }
    };
    conns.add(conn);
    const bye = () => { conns.delete(conn); try { sock.destroy(); } catch (e) {} };
    const decode = makeDecoder(text => {
      let msg;
      try { msg = JSON.parse(text); } catch (e) { return; }
      if (!Array.isArray(msg)) return;
      if (msg[0] === 'EVENT' && msg[1] && msg[1].id){
        const ev = msg[1];
        log('EVENT kind', ev.kind);
        conn.send(['OK', ev.id, true, '']);
        for (const c of conns)
          for (const [subId, filters] of c.subs)
            if (filters.some(f => matches(ev, f))){ c.send(['EVENT', subId, ev]); break; }
      } else if (msg[0] === 'REQ' && typeof msg[1] === 'string'){
        conn.subs.set(msg[1], msg.slice(2).filter(f => f && typeof f === 'object'));
        log('REQ', msg[1]);
        conn.send(['EOSE', msg[1]]);
      } else if (msg[0] === 'CLOSE' && typeof msg[1] === 'string'){
        conn.subs.delete(msg[1]);
      }
    }, bye, payload => { try { sock.write(encodeFrame(10, payload)); } catch (e) {} });
    sock.on('data', decode);
    sock.on('error', bye);
    sock.on('close', bye);
  });

  await new Promise(r => server.listen(port, '127.0.0.1', r));
  const url = (tls ? 'wss' : 'ws') + '://127.0.0.1:' + server.address().port;
  return {
    url,
    server,
    clients: () => conns.size,
    close: () => { for (const c of conns) try { c.sock.destroy(); } catch (e) {} server.close(); }
  };
}
