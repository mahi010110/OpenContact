/* ============================================================
   OpenContact — interface · état & persistance
   L'état de l'application, son chargement (avec migration v1/v2),
   ses sauvegardes, le journal privé, et les gestes métier sur une
   piste (statut, prochaine action, clôture). Le moteur ne lit
   jamais l'écran ; ici, l'écran pilote le moteur.
   ============================================================ */
import { todayISO, fmtDate, uid } from '../engine/utils.js';
import { STATUSES, CLOSE_REASONS, normalizeCompany, normalizeContact,
         normalizeProfile, pushHist } from '../engine/model.js';
import { DATA_KEY, PROFILE_KEY, JOURNAL_KEY, ORPHANS_KEY, THEME_KEY,
         OLD_V2, OLD_V1, kvInit, kvGet, kvSet, getBackend } from '../engine/storage.js';

export const S = {
  companies: [],
  orphans: [],          /* contacts « à rattacher » */
  profile: null,
  journal: [],          /* privé, jamais partagé */
  theme: 'light',
  route: 'aujourdhui'
};
/* app.js branche ici le re-rendu de la vue courante */
export const bus = { refresh(){} };

export function setSaveWarn(bad){
  const w = document.getElementById('saveWarn');
  if (w) w.hidden = !bad;
}
export function saveData(){ kvSet(DATA_KEY, JSON.stringify(S.companies)).then(ok => setSaveWarn(!ok)); }
export function saveProfile(){ kvSet(PROFILE_KEY, JSON.stringify(S.profile)).then(ok => setSaveWarn(!ok)); }
export function saveOrphans(){ kvSet(ORPHANS_KEY, JSON.stringify(S.orphans)).then(ok => setSaveWarn(!ok)); }
export function logJ(txt, cid){
  S.journal.push({ t: Date.now(), txt, cid: cid || null });
  if (S.journal.length > 200) S.journal = S.journal.slice(-200);
  kvSet(JOURNAL_KEY, JSON.stringify(S.journal));
}

export async function loadAll(){
  await kvInit();
  const t = await kvGet(THEME_KEY);
  S.theme = (t === 'light' || t === 'dark') ? t
    : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  let p = null;
  try { p = JSON.parse(await kvGet(PROFILE_KEY)); } catch (e) {}
  S.profile = normalizeProfile(p);
  try { S.journal = JSON.parse(await kvGet(JOURNAL_KEY)) || []; } catch (e) { S.journal = []; }
  if (!Array.isArray(S.journal)) S.journal = [];
  try { S.orphans = (JSON.parse(await kvGet(ORPHANS_KEY)) || []).map(normalizeContact); } catch (e) { S.orphans = []; }
  const raw = await kvGet(DATA_KEY);
  if (raw){
    try { S.companies = (JSON.parse(raw) || []).map(normalizeCompany); } catch (e) { S.companies = []; }
  }
  if (!S.companies.length){
    /* migration une seule fois depuis les très anciennes clés */
    for (const k of [OLD_V2, OLD_V1]){
      const old = await kvGet(k);
      if (!old) continue;
      try {
        const arr = JSON.parse(old) || [];
        if (arr.length){ S.companies = arr.map(normalizeCompany); saveData(); break; }
      } catch (e) {}
    }
  }
  if (getBackend() === 'memory') setSaveWarn(true);
}

/* ---------- gestes métier sur une piste ---------- */
export const isClosed = c => !!c.closedReason;

export function setStatus(c, st){
  if (!STATUSES[st] || c.status === st) return;
  c.status = st;
  c.updatedAt = Date.now();
  pushHist(c, 'Statut → ' + STATUSES[st].label);
  logJ('Statut : ' + c.name + ' → ' + STATUSES[st].label, c.id);
  saveData();
}
export function setNextAction(c, text, dateISO){
  c.nextActionText = String(text || '').trim();
  c.nextAction = dateISO || '';
  c.updatedAt = Date.now();
  if (c.nextAction) pushHist(c, 'À faire : ' + (c.nextActionText || 'faire le point') + ' — ' + fmtDate(c.nextAction));
  saveData();
}
export function markDone(c){
  const label = c.nextActionText || 'l’action prévue';
  pushHist(c, 'Fait : ' + label);
  logJ('Fait : ' + label + ' — ' + c.name, c.id);
  c.nextAction = '';
  c.nextActionText = '';
  c.updatedAt = Date.now();
  saveData();
}
export function closePiste(c, reason){
  if (!CLOSE_REASONS[reason]) return;
  c.closedReason = reason;
  c.closedAt = todayISO();
  c.nextAction = '';
  c.nextActionText = '';
  c.updatedAt = Date.now();
  pushHist(c, 'Clôturée — ' + CLOSE_REASONS[reason].label);
  logJ('Clôturée (' + CLOSE_REASONS[reason].label + ') : ' + c.name, c.id);
  saveData();
}
export function reopenPiste(c){
  c.closedReason = '';
  c.closedAt = '';
  c.updatedAt = Date.now();
  pushHist(c, 'Rouverte');
  logJ('Rouverte : ' + c.name, c.id);
  saveData();
}

/* ---------- pistes d'exemple (supprimables d'un tap) ---------- */
export function hasDemo(){ return S.companies.some(c => c.demo); }
export function addDemo(){
  const mk = (x, days, text) => {
    const c = normalizeCompany(Object.assign({ id: uid(), demo: true }, x));
    if (text){
      c.nextActionText = text;
      const d = new Date(); d.setDate(d.getDate() + days);
      c.nextAction = d.toISOString().slice(0, 10);
    }
    c.history = [{ d: todayISO(), t: 'Piste d’exemple' }];
    return c;
  };
  S.companies.push(
    mk({ name: 'Orange Cyberdefense', city: 'Lille', domain: 'cyber', status: 'active',
         desc: 'Filiale cybersécurité d’Orange', techs: 'SOC, EDR, Fortinet',
         contacts: [{ name: 'Nadia Rahmani', role: 'RH', email: 'nadia.rahmani@exemple.fr' }] },
       -4, 'Relancer le RH'),
    mk({ name: 'Damart — DSI', city: 'Roubaix', domain: 'dsi', status: 'todo',
         desc: 'DSI du groupe textile', techs: 'Windows Server, réseau magasin' },
       0, 'Envoyer la candidature'),
    mk({ name: 'OVHcloud', city: 'Roubaix', domain: 'cloud', status: 'reply',
         desc: 'Hébergeur européen', techs: 'Linux, OpenStack',
         contacts: [{ name: 'Théo Vasseur', role: 'Team lead infra', email: 'theo.vasseur@exemple.fr' }] },
       3, 'Préparer l’entretien')
  );
  saveData();
}
export function removeDemo(){
  S.companies = S.companies.filter(c => !c.demo);
  saveData();
}
