/* ============================================================
   OpenContact — moteur · campagnes de prospection
   Le modèle V1 est « Fixe », volontairement prescriptif (D3) :
   un message à J0, une relance à J+7, une seconde à J+14 —
   calées sur la date d'ENVOI réel du message précédent, pas sur
   un calendrier théorique. 15 envois par jour maximum ; ce qui
   ne part pas glisse au lendemain. L'arrêt sur réponse n'est
   pas débrayable : une cible « répondue » ne reçoit plus rien.
   La mention d'opposition est imposée au montage.

   Idempotence par construction : chaque envoi porte un
   identifiant STABLE `id.cible.étape` ; le journal des envois
   effectués fait foi — rejouer le journal ou re-demander les
   envois dus ne crée jamais un doublon. Aucun envoi automatique
   ici : ce moteur ne fait que dire « voilà ce qui est dû » et
   enregistrer « voilà ce qui est parti » (D13 : sans Compagnon,
   c'est l'utilisateur qui appuie).

   Un modèle « cadré » (étapes libres) est accepté par les
   fonctions d'exécution mais AUCUN constructeur ne l'expose (V1).
   Fonctions pures — la date du jour est toujours un paramètre.
   ============================================================ */
import { fillTpl } from './model.js';

export const DAILY_CAP = 15;           /* GLOBAL : toutes campagnes confondues */
export const STEP_DAYS = 7;            /* J+7 puis J+14 (7 après la relance 1) */

/* fenêtre d'envoi raisonnable, imposée (SPECIFICATIONS §7.1) :
   jours ouvrés, 8 h → 18 h 59 — heure LOCALE de l'utilisateur */
export const SEND_FROM = 8;
export const SEND_TO = 19;
export const SEND_WINDOW_TXT = 'du lundi au vendredi, 8 h – 19 h';
export function inSendWindow(now){
  const d = now instanceof Date ? now : new Date(now || Date.now());
  const day = d.getDay();
  return day >= 1 && day <= 5 && d.getHours() >= SEND_FROM && d.getHours() < SEND_TO;
}
export const OPPOSITION =
  'PS : si tu ne souhaites plus recevoir mes messages, dis-le-moi simplement et je m’arrête là.';

/* la mention d'opposition, imposée — ajoutée si absente (heuristique :
   un message qui parle déjà d'opposition/désinscription est accepté) */
export function withOpposition(body){
  const b = String(body || '');
  if (/ne\s+(souhaite[sz]?\s+plus|plus\s+recevoir)|désinscri|opposition|je m’arrête là|je m'arrête là/i.test(b)) return b;
  return b.trim() + '\n\n' + OPPOSITION;
}

/* arithmétique de dates sur AAAA-MM-JJ — UTC : insensible à l'heure d'été */
export function addDays(iso, n){
  const [y, m, d] = String(iso).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/* ---------- montage ----------
   targets : [{ cid, name, company, email, role? }] — l'appelant a déjà
   choisi le contact de chaque piste (et écarté celles sans email).
   steps : 3 gabarits { subject, body } (Fixe). Les messages sont
   personnalisés et FIGÉS au montage : ce que l'utilisateur a relu est
   exactement ce qui part, même si la fiche change ensuite. */
export function buildCampaign(o){
  const steps = (o.steps || []).slice(0, 3).map((s, i) => ({
    n: i,
    subject: String(s.subject || '').slice(0, 200),
    body: withOpposition(s.body)
  }));
  if (steps.length !== 3) throw new Error('etapes');
  const targets = (o.targets || []).map((t, i) => {
    const c = t.companyObj || { name: t.company || '', city: '' };
    const ct = { name: t.name || '', email: t.email || '', role: t.role || '' };
    return {
      tid: 't' + (i + 1),
      cid: t.cid,
      email: String(t.email || '').trim(),
      who: t.name || t.email || '',
      company: c.name || t.company || '',
      startAt: o.launchAt,
      state: 'active',                 /* active | replied | done | error */
      msgs: steps.map(s => ({
        subject: fillTpl(s.subject, c, ct, o.profile || {}),
        body: fillTpl(s.body, c, ct, o.profile || {})
      }))
    };
  }).filter(t => t.email);
  if (!targets.length) throw new Error('cibles');
  return {
    id: o.id || ('cp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    v: 1,
    name: String(o.name || 'Campagne').slice(0, 80),
    model: 'fixe',
    state: 'ready',                    /* ready | paused | stopped | done */
    auto: false,                       /* true = confiée au Compagnon (par campagne) */
    from: String(o.from || ''),
    createdAt: o.launchAt,
    steps,
    targets,
    log: []                            /* { sid, tid, step, at } — les envois FAITS */
  };
}

/* ---------- lecture du journal ---------- */
export const sendId = (c, tid, step) => c.id + '.' + tid + '.' + step;
const logBySid = c => {
  const m = Object.create(null);
  for (const l of (c.log || [])) m[l.sid] = l;
  return m;
};
export function sentAt(c, tid, step){
  const l = (c.log || []).find(x => x.tid === tid && x.step === step);
  return l ? l.at : '';
}
export function sentToday(c, today){
  return (c.log || []).filter(l => l.at === today).length;
}

/* ---------- ce qui est dû aujourd'hui ----------
   Relances d'abord (elles sont datées), puis premiers messages ;
   jamais plus que la cadence du jour. Une cible « répondue » ou en
   erreur ne reçoit rien. Rejouer la fonction ne rend jamais un
   envoi déjà au journal. */
export function dueSends(c, today){
  if (c.state !== 'ready') return [];
  const done = logBySid(c);
  const due = [];
  for (const t of c.targets){
    if (t.state !== 'active') continue;
    for (let step = 0; step < t.msgs.length; step++){
      const sid = sendId(c, t.tid, step);
      if (done[sid]) continue;
      if (step === 0){
        if (t.startAt <= today) due.push({ sid, tid: t.tid, step, t });
      } else {
        const prev = sentAt(c, t.tid, step - 1);
        if (prev && addDays(prev, STEP_DAYS) <= today) due.push({ sid, tid: t.tid, step, t });
      }
      break;   /* une seule étape due à la fois par cible */
    }
  }
  due.sort((a, b) => (b.step - a.step) || (a.t.startAt < b.t.startAt ? -1 : 1));
  const room = Math.max(0, DAILY_CAP - sentToday(c, today));
  return due.slice(0, room).map(d => ({
    sid: d.sid, tid: d.tid, cid: d.t.cid, step: d.step,
    email: d.t.email, who: d.t.who, company: d.t.company,
    subject: d.t.msgs[d.step].subject, body: d.t.msgs[d.step].body
  }));
}

/* ---------- le plafond GLOBAL (15/j toutes campagnes) ----------
   dueSends plafonne DANS une campagne ; ces deux fonctions font foi
   dès qu'il en existe plusieurs — la feuille du jour et le Compagnon
   passent par elles, jamais par dueSends seul. */
export function sentTodayAll(cs, today){
  return (cs || []).reduce((n, c) => n + sentToday(c, today), 0);
}
export function dueSendsAll(cs, today){
  const room = Math.max(0, DAILY_CAP - sentTodayAll(cs, today));
  const out = [];
  for (const c of (cs || []))
    for (const d of dueSends(c, today)) out.push(Object.assign({ cpId: c.id }, d));
  out.sort((a, b) => b.step - a.step);   /* relances d'abord, toutes campagnes */
  return out.slice(0, room);
}

/* enregistrer un envoi fait — idempotent (même sid = rien de plus).
   Rend une NOUVELLE campagne (jamais de mutation). */
export function markSent(c, sid, today){
  if ((c.log || []).some(l => l.sid === sid)) return c;
  const parts = String(sid).split('.');
  const step = Number(parts.pop());
  const tid = parts.pop();
  if (!c.targets.some(t => t.tid === tid)) return c;   /* sid étranger : ignoré */
  const out = Object.assign({}, c, {
    log: (c.log || []).concat([{ sid, tid, step, at: today }]),
    targets: c.targets.map(t => (t.tid === tid && step === t.msgs.length - 1)
      ? Object.assign({}, t, { state: 'done' })
      : t)
  });
  return refreshDone(out);
}
/* un envoi qui a échoué : la cible est marquée, jamais re-tentée en
   silence (SPECIFICATIONS §13 — résultat incertain = à vérifier) */
export function markError(c, tid){
  return refreshDone(Object.assign({}, c, {
    targets: c.targets.map(t => t.tid === tid ? Object.assign({}, t, { state: 'error' }) : t)
  }));
}
/* réponse reçue (à la main ou par le Compagnon) : les relances
   restantes de CETTE cible sont annulées — non débrayable */
export function markReplied(c, cid){
  return refreshDone(Object.assign({}, c, {
    targets: c.targets.map(t => (t.cid === cid && t.state === 'active')
      ? Object.assign({}, t, { state: 'replied' })
      : t)
  }));
}
function refreshDone(c){
  if (c.state !== 'ready') return c;
  const open = c.targets.some(t => t.state === 'active');
  return open ? c : Object.assign({}, c, { state: 'done' });
}

/* ---------- pause / reprise / arrêt ---------- */
export function pauseCampaign(c){ return c.state === 'ready' ? Object.assign({}, c, { state: 'paused' }) : c; }
export function resumeCampaign(c){ return c.state === 'paused' ? Object.assign({}, c, { state: 'ready' }) : c; }
export function stopCampaign(c){
  return (c.state === 'done') ? c : Object.assign({}, c, { state: 'stopped' });
}

/* ---------- bilan ---------- */
export function campaignStats(c){
  const s = { targets: c.targets.length, sent: (c.log || []).length,
    replied: 0, done: 0, error: 0, active: 0 };
  for (const t of c.targets) s[t.state === 'active' ? 'active' : t.state]++;
  return s;
}
