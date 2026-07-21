/* ============================================================
   OpenContact — sonde du transport PUBLIC (incident #14)
   La CI ne doit pas rester verte quand les relais Nostr publics —
   ceux que l'application choisit RÉELLEMENT (mélange déterministe
   par appId dans le bundle vendorisé) — sont morts ou muets.
   Pour chaque relais choisi : connexion WebSocket réelle, REQ
   NIP-01, attente d'un EOSE. Moins de 2 relais sains = échec.
   Ne sonde pas le WebRTC (impossible sans deux réseaux réels) —
   la chaîne complète est couverte par e2e-liaison.mjs en local.
   Réseau sortant requis : ne tourne que si OC_SONDE_RELAIS=1
   (le poste de dev peut être derrière un proxy qui bloque wss).
   ============================================================ */
if (process.env.OC_SONDE_RELAIS !== '1'){
  console.log('↷ sonde sautée — OC_SONDE_RELAIS=1 pour sonder les relais publics (CI).');
  process.exit(0);
}

const RealWebSocket = globalThis.WebSocket;

/* 1. les relais que l'app choisit vraiment : on laisse le bundle
   vendorisé faire SA sélection (appId, mélange, redondance) */
const captured = [];
globalThis.WebSocket = class {
  constructor(u){ captured.push(String(u)); this.url = u; this.readyState = 0; }
  send(){} close(){} addEventListener(){} removeEventListener(){}
  set onopen(f){} set onclose(f){} set onmessage(f){} set onerror(f){}
};
globalThis.RTCPeerConnection = class {
  createDataChannel(){ return { addEventListener(){}, close(){} }; }
  addEventListener(){}
  async createOffer(){ return { sdp: 'v=0', type: 'offer' }; }
  async setLocalDescription(){} async setRemoteDescription(){} close(){}
  get localDescription(){ return { sdp: 'v=0', type: 'offer' }; }
};
const { joinRoom } = await import('../../assets/vendor/trystero-nostr.min.js');
joinRoom({ appId: 'opencontact', password: 'sonde' }, 'sonde-transport');
await new Promise(r => setTimeout(r, 1500));
globalThis.WebSocket = RealWebSocket;
const relais = [...new Set(captured)];
if (!relais.length){ console.error('aucun relais capturé — bundle changé ?'); process.exit(1); }
console.log('relais choisis par l’app :', relais.join(', '));

/* 2. sonde réelle : connexion + REQ → EOSE */
const sonde = url => new Promise(res => {
  let fini = false;
  let ws = null;
  const bilan = why => {
    if (fini) return;
    fini = true;
    clearTimeout(t);
    if (ws){ ws.onerror = ws.onmessage = ws.onopen = null; try { ws.close(); } catch (e) {} }
    res(why);
  };
  const t = setTimeout(() => bilan('délai'), 10000);
  try { ws = new RealWebSocket(url); } catch (e) { return bilan('connexion'); }
  ws.onerror = () => bilan('connexion');
  ws.onopen = () => {
    const subId = 'oc-sonde-' + Math.random().toString(36).slice(2, 10);
    ws.send(JSON.stringify(['REQ', subId, { kinds: [21000], since: Math.floor(Date.now() / 1000), '#x': ['oc-sonde'] }]));
  };
  ws.onmessage = e => {
    try {
      const [type] = JSON.parse(e.data);
      if (type === 'EOSE') bilan('sain');
      else if (type === 'NOTICE' || type === 'CLOSED') bilan('refus');
    } catch (x) {}
  };
});

let sains = 0;
for (const url of relais){
  const r = await sonde(url);
  if (r === 'sain') sains++;
  console.log((r === 'sain' ? '✓' : '✗') + ' ' + url + ' — ' + r);
}
console.log(`${sains}/${relais.length} relais publics répondent (NIP-01).`);
if (sains < 2){
  console.error('TRANSPORT PUBLIC DÉGRADÉ : moins de 2 relais sains — le partage en ' +
    'groupe et la sync ne peuvent pas trouver de pair en conditions réelles (#14).');
  process.exit(1);
}
process.exit(0);
