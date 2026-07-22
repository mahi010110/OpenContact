/* ============================================================
   OpenContact — moteur · modèle de données
   Ce que « sont » une piste, un contact, un profil : constantes,
   normalisation (v3 : plusieurs contacts par piste), valeurs par
   défaut, historique, gabarits d'emails. C'est le contrat de
   données de l'application — aucun accès au DOM.
   ============================================================ */
import { uid, extractCity, todayISO, fmtDate } from './utils.js';

export const APP_VERSION = '6.3.0';

export const DOMAINS = {
  esn:     { label:'ESN / Services IT',       color:'#4C9FD8' },
  cyber:   { label:'Cybersécurité',           color:'#9B7FD4' },
  cloud:   { label:'Cloud / Hébergeur',       color:'#2FA98C' },
  dsi:     { label:'DSI / Grande entreprise', color:'#D89A3C' },
  public:  { label:'Secteur public',          color:'#D97B54' },
  startup: { label:'Startup / PME tech',      color:'#D56D9B' },
  industrie:{ label:'Industrie / BTP',        color:'#8D6E63' },
  commerce:{ label:'Commerce / Services',     color:'#5C6BC0' },
  sante:   { label:'Santé / Social',          color:'#43A047' },
  autre:   { label:'Autre',                   color:'#8A99A6' }
};
/* statut vivant à 3 crans (v6) — les anciens statuts v5 sont migrés à la
   normalisation : sent/followup → active, interview → reply, won/rejected
   → piste clôturée (closedReason) */
export const STATUSES = {
  todo:   { label:'À contacter', color:'#8A99A6' },
  active: { label:'En cours',    color:'#4C9FD8' },
  reply:  { label:'Réponse',     color:'#9B7FD4' }
};
export const LEGACY_STATUSES = { sent:'active', followup:'active', interview:'reply' };
/* clôture (privée) : la piste quitte le quotidien, reste dans la liste */
export const CLOSE_REASONS = {
  won:      { label:'Décroché',  color:'#2FA070' },
  rejected: { label:'Refusé',    color:'#D96A74' },
  dropped:  { label:'Abandonné', color:'#8A99A6' }
};
export const POSITIONS = { stage:'Stage', alternance:'Alternance', cdi:'CDI', cdd:'CDD', freelance:'Freelance' };

/* ---------- 5. modèle v3 : plusieurs contacts par piste ----------
   D3 : les champs inconnus (versions futures) sont conservés dans `extra`
   au lieu d'être perdus silencieusement. */
const KNOWN_CT = ['id','name','role','email','phone','link','note','conf','extra',
  'activatedAt','src'];         /* champs d'action privés (#14) — jamais dans un partage */
const KNOWN_C  = ['id','name','city','domain','desc','address','website','techs','positions',
  'process','tips','contacts','lat','lng','status','notes','appliedAt','nextAction',
  'nextActionText','closedAt','closedReason','nextActionCt',
  'history','verifiedAt','confirmations','demo','createdAt','updatedAt','extra',
  'contact','email','phone'];   /* les 3 derniers : héritage v1, absorbés dans contacts */
/* un lien ne sort d'ici qu'en http(s) : « javascript: » et consorts, posés
   dans un fichier reçu, deviendraient exécutables au clic (S1 de l'audit) */
export function safeUrl(u){
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([\/?#]\S*)?$/i.test(u)) return 'https://' + u;
  return '';
}
/* un id finit en attribut DOM et voyage entre appareils : seul un jeton
   sobre est accepté, tout le reste est régénéré — un id piégé dans un
   fichier reçu ne doit jamais casser le HTML (S2 de l'audit) */
const ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const safeId = v => (typeof v === 'string' && ID_RE.test(v)) ? v : uid();
/* une date s'affiche parfois telle quelle (frDate) : seule la forme
   AAAA-MM-JJ passe — un horodatage complet est tronqué au jour, tout le
   reste est vidé (S3 de l'audit) */
const isoDay = v => { const m = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(String(v || '')); return m ? m[1] : ''; };
/* « __proto__ » et consorts, posés en clé d'un JSON reçu, détourneraient le
   prototype de l'objet au lieu d'y poser une donnée (S4 de l'audit) */
const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
function keepExtra(x, known){
  const base = {};
  const src = (x.extra && typeof x.extra === 'object' && !Array.isArray(x.extra)) ? x.extra : null;
  if (src) for (const k of Object.keys(src)) if (!BAD_KEYS.includes(k)) base[k] = src[k];
  for (const k of Object.keys(x)) if (!known.includes(k) && !BAD_KEYS.includes(k)) base[k] = x[k];
  return Object.keys(base).length ? base : null;
}
export function normalizeContact(x){
  x = x || {};
  const out = {
    id: safeId(x.id),
    name: String(x.name || '').trim(),
    role: String(x.role || '').trim(),
    email: String(x.email || '').trim(),
    phone: String(x.phone || '').trim(),
    link: safeUrl(x.link),
    note: String(x.note || '').trim(),
    conf: (x.conf === 'ok' || x.conf === 'doubt') ? x.conf : ''
  };
  /* champs d'action privés (#14) — optionnels, absents quand vides.
     Migration en lecture : un appareil ancien les a rangés dans extra
     (champs inconnus pour lui), on les remonte et on nettoie le doublon. */
  const xe = (x.extra && typeof x.extra === 'object' && !Array.isArray(x.extra)) ? x.extra : {};
  const act = isoDay(x.activatedAt || xe.activatedAt);
  if (act) out.activatedAt = act;
  if (x.src === 'promo' || xe.src === 'promo') out.src = 'promo';
  const extra = keepExtra(x, KNOWN_CT);
  if (extra){
    delete extra.activatedAt;
    delete extra.src;
    if (Object.keys(extra).length) out.extra = extra;
  }
  return out;
}
/* #14 — le contact « activé » (on lui a écrit / posé une action) vs le
   simple nom connu ; et la personne que vise la prochaine action */
export const isActiveCt = ct => !!(ct && ct.activatedAt);
export const nextActionContact = c =>
  (c && c.nextActionCt && (c.contacts || []).find(t => t.id === c.nextActionCt)) || null;
export function contactHasData(ct){ return !!(ct.name || ct.role || ct.email || ct.phone || ct.link || ct.note); }
export function normalizeCompany(x){
  let contacts = Array.isArray(x.contacts) ? x.contacts.map(normalizeContact) : [];
  if (!contacts.length && (x.contact || x.email || x.phone)){
    contacts = [normalizeContact({ name: x.contact, email: x.email, phone: x.phone })];
  }
  contacts = contacts.filter(contactHasData);
  /* migration des statuts v5 : terminaux → clôture, intermédiaires → 3 crans */
  let status = x.status;
  let closedAt = isoDay(x.closedAt);
  let closedReason = CLOSE_REASONS[x.closedReason] ? x.closedReason : '';
  if (status === 'won' || status === 'rejected'){
    if (!closedReason) closedReason = status === 'won' ? 'won' : 'rejected';
    if (!closedAt) closedAt = x.updatedAt ? new Date(x.updatedAt).toISOString().slice(0,10) : todayISO();
    status = 'reply';
  } else if (LEGACY_STATUSES[status]) status = LEGACY_STATUSES[status];
  const out = {
    id: safeId(x.id),
    name: String(x.name || '').trim(),
    city: String(x.city || '').trim() || extractCity(x.address),
    domain: DOMAINS[x.domain] ? x.domain : 'autre',
    desc: x.desc || '',
    address: x.address || '',
    website: x.website || '',
    techs: x.techs || '',
    positions: Array.isArray(x.positions) ? x.positions.filter(p => POSITIONS[p]) : [],
    process: x.process || '',
    tips: x.tips || '',
    contacts,
    lat: (typeof x.lat === 'number') ? x.lat : null,
    lng: (typeof x.lng === 'number') ? x.lng : null,
    status: STATUSES[status] ? status : 'todo',
    notes: x.notes || '', appliedAt: isoDay(x.appliedAt), nextAction: isoDay(x.nextAction),
    nextActionText: String(x.nextActionText || '').trim(),
    closedAt, closedReason,
    history: Array.isArray(x.history) ? x.history.slice(-40) : [],
    verifiedAt: isoDay(x.verifiedAt),
    confirmations: Number(x.confirmations) || 0,
    demo: !!x.demo,
    createdAt: x.createdAt || Date.now(), updatedAt: x.updatedAt || Date.now()
  };
  /* #14 — la personne visée par la prochaine action (privé, optionnel,
     absent quand vide) : un jeton d'id seulement, avec la même migration
     en lecture depuis extra que les champs d'action du contact */
  const xe = (x.extra && typeof x.extra === 'object' && !Array.isArray(x.extra)) ? x.extra : {};
  const nact = [x.nextActionCt, xe.nextActionCt]
    .find(v => typeof v === 'string' && ID_RE.test(v));
  if (nact) out.nextActionCt = nact;
  const extra = keepExtra(x, KNOWN_C);
  if (extra){
    delete extra.nextActionCt;
    if (Object.keys(extra).length) out.extra = extra;
  }
  return out;
}
export function defaultTemplates(){
  return [
    { id: uid(), name: 'Candidature spontanée', subject: 'Candidature spontanée — {{formation}}',
      body: `Bonjour {{contact}},

Actuellement en formation {{formation}}, je suis à la recherche d'un stage et l'activité de {{entreprise}} a retenu toute mon attention.

[1 à 2 phrases personnalisées : pourquoi cette entreprise, ce que tu peux lui apporter]

Vous trouverez mon CV ici : {{cv}}
Je reste disponible pour un échange au {{tel}} ou par retour de mail.

Merci pour votre attention,
{{moi}} — {{email}}` },
    { id: uid(), name: 'Relance', subject: 'Relance — candidature {{formation}}',
      body: `Bonjour {{contact}},

Je me permets de revenir vers vous au sujet de ma candidature envoyée récemment à {{entreprise}}, restée sans réponse à ce jour.

Toujours très motivé(e) à l'idée de rejoindre vos équipes, je reste à votre disposition pour tout échange.

Bien cordialement,
{{moi}} — {{tel}} — {{email}}` },
    { id: uid(), name: 'Remerciement après entretien', subject: 'Merci pour notre échange — {{moi}}',
      body: `Bonjour {{contact}},

Merci pour le temps que vous m'avez accordé lors de notre entretien. Notre échange a confirmé mon envie de rejoindre {{entreprise}}.

[1 phrase : un point marquant de l'entretien]

Je reste à votre disposition pour toute information complémentaire.

Bien cordialement,
{{moi}} — {{tel}}` }
  ];
}
/* prompts IA de l'utilisateur : bornés pour rester un coup de pouce,
   pas une bibliothèque — 8 prompts de 4 000 caractères max. Un seul
   par défaut : l'universel « mes emails → un JSON prêt à coller ». */
export const PROMPTS_MAX = 8;
export const PROMPT_MAX_LEN = 4000;
export function defaultPrompts(){
  return [{
    name: 'Mes emails → pistes',
    text: `Voici des emails liés à ma recherche de stage / alternance / emploi :

[colle ici tes emails — expéditeur, objet, corps]

Extrais-en les entreprises et contacts utiles, et rends UNIQUEMENT un JSON valide (aucun texte autour) à ce format exact :
{"v":4,"kind":"share","companies":[{"name":"","city":"","domain":"esn|cyber|cloud|dsi|public|startup|industrie|commerce|sante|autre","desc":"","website":"","techs":"","positions":["stage","alternance","cdi","cdd","freelance"],"process":"","tips":"","contacts":[{"name":"","role":"","email":"","phone":"","link":"","note":""}]}]}

Règles : n'invente rien — champ inconnu = vide ; une entrée par entreprise ; regroupe les contacts d'une même entreprise ; "note" = le contexte de l'échange (ex : « a répondu le 12/06, propose un entretien ») ; ignore newsletters et refus automatiques.

Je collerai ce JSON dans OpenContact : Échanger → Recevoir → Coller.`
  }];
}
export function defaultProfile(){
  return { name:'', formation:'', phone:'', email:'', cvUrl:'', portfolio:'', letter:'',
           templates: defaultTemplates(), prompts: defaultPrompts(),
           confirmedIds: [], flags: {}, updatedAt: 0 };
}
/* remet un profil (chargé, importé ou restauré) aux invariants attendus */
export function normalizeProfile(raw){
  const profile = defaultProfile();
  if (raw && typeof raw === 'object')
    for (const k of Object.keys(raw)) if (!BAD_KEYS.includes(k)) profile[k] = raw[k];
  if (!Array.isArray(profile.templates) || !profile.templates.length) profile.templates = defaultTemplates();
  if (!Array.isArray(profile.prompts) || !profile.prompts.length) profile.prompts = defaultPrompts();
  profile.prompts = profile.prompts.slice(0, PROMPTS_MAX).map(p => ({
    name: (String((p && p.name) || '').trim() || 'Prompt').slice(0, 60),
    text: String((p && p.text) || '').slice(0, PROMPT_MAX_LEN)
  }));
  if (!Array.isArray(profile.confirmedIds)) profile.confirmedIds = [];
  if (!profile.flags || typeof profile.flags !== 'object') profile.flags = {};
  profile.updatedAt = Number(profile.updatedAt) || 0;   /* LWW entre appareils */
  return profile;
}
/* historique d'une piste (privé) : création, statuts, emails, notes, contacts… */
export function pushHist(c, t){
  (c.history = c.history || []).push({ d: todayISO(), t });
  if (c.history.length > 40) c.history = c.history.slice(-40);
}
/* résume ce qui a RÉELLEMENT changé entre deux états du suivi — la
   fiche (formulaire) n'écrit qu'une entrée d'historique, au moment
   du « Confirmer », jamais un micro-geste à la fois */
export function summarizeChanges(before, after){
  const parts = [];
  if (after.status !== before.status && STATUSES[after.status])
    parts.push('Statut → ' + STATUSES[after.status].label);
  if (after.nextAction !== before.nextAction || after.nextActionText !== before.nextActionText){
    if (after.nextAction)
      parts.push('À faire : ' + (after.nextActionText || 'faire le point') + ' — ' + fmtDate(after.nextAction));
    else if (before.nextAction)
      parts.push('Action retirée');
  }
  if (after.notes !== before.notes) parts.push('Notes modifiées');
  return parts.join(' · ');
}
/* remplit un gabarit {{variable}} avec la piste, le contact visé et le profil */
export function fillTpl(str, c, ct, profile){
  const m = {
    entreprise: c.name || '',
    contact: (ct && ct.name) || 'Madame, Monsieur',
    ville: c.city || extractCity(c.address),
    moi: profile.name || '', formation: profile.formation || '',
    tel: profile.phone || '', email: profile.email || '',
    cv: profile.cvUrl || '', portfolio: profile.portfolio || ''
  };
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => m[k] !== undefined ? m[k] : '');
}
