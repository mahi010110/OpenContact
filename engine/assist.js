/* ============================================================
   OpenContact — moteur · aides (sans IA d'abord)
   Le socle marche sans aucune IA : priorisation locale des
   relances dues, et extraction d'un contact depuis une signature
   d'email collée (heuristique, aucune donnée qui sort). Quand une
   IA est branchée, elle ne fait que PROPOSER un brouillon dans le
   composeur — jamais un envoi (P6-2, côté UI).
   Fonctions pures, aucun accès au DOM ni au réseau.
   ============================================================ */

/* ---------- priorisation locale des relances ----------
   Une piste « à relancer » = une prochaine action datée aujourd'hui
   ou passée. On classe par retard (le plus en retard d'abord), puis
   par avancement (une piste déjà relancée prime : ne pas la lâcher). */
export function dueFollowups(companies, today){
  const out = [];
  for (const c of (companies || [])){
    if (c.closedReason || !c.nextAction) continue;
    if (c.nextAction > today) continue;
    const lateDays = daysBetween(c.nextAction, today);
    const touches = (c.history || []).filter(h => /envoyé|relance|préparé/i.test(h.t)).length;
    out.push({ id: c.id, name: c.name, when: c.nextAction, lateDays,
      verb: c.nextActionText || 'Faire le point', touches });
  }
  out.sort((a, b) => (b.lateDays - a.lateDays) || (b.touches - a.touches));
  return out;
}
function daysBetween(a, b){
  const d1 = Date.UTC(...a.split('-').map((n, i) => i === 1 ? +n - 1 : +n));
  const d2 = Date.UTC(...b.split('-').map((n, i) => i === 1 ? +n - 1 : +n));
  return Math.round((d2 - d1) / 86400000);
}

/* ---------- signature → contact (heuristique locale) ----------
   Colle une signature d'email : on en tire nom, rôle, email,
   téléphone, lien — tout ce qui est reconnaissable, sans jamais
   inventer. Rien ne part sur le réseau. */
const RE_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const RE_PHONE = /(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?){2,5}\d{2,4}/;
const RE_URL = /\b((?:https?:\/\/|www\.)[^\s<>()]+)/i;
const ROLE_HINT = /\b(RH|DRH|DSI|RSSI|CTO|CEO|DG|responsable|charg[ée]e?|recruteu(?:r|se)|manager|directrice?|ing[ée]nieure?|talent|people|consultante?)\b/i;

export function contactFromSignature(text){
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const out = {};
  const emailM = raw.match(RE_EMAIL);
  if (emailM) out.email = emailM[0].toLowerCase();
  const phoneM = raw.replace(RE_EMAIL, ' ').match(RE_PHONE);
  if (phoneM && phoneM[0].replace(/\D/g, '').length >= 8) out.phone = phoneM[0].replace(/\s+/g, ' ').trim();
  const urlM = raw.match(RE_URL);
  if (urlM) out.link = urlM[1].replace(/[.,;]$/, '');
  /* le nom : une ligne courte « Prénom Nom » sans @, sans chiffres,
     de préférence la première — les signatures commencent par le nom */
  for (const l of lines){
    if (RE_EMAIL.test(l) || /\d/.test(l) || l.length > 48) continue;
    if (/^[A-ZÀ-Ÿ][\wÀ-ÿ'’-]+(?:\s+[A-ZÀ-Ÿ][\wÀ-ÿ'’.-]+){1,3}$/.test(l) && !ROLE_HINT.test(l)){
      out.name = l;
      break;
    }
  }
  /* le rôle : une ligne qui sent la fonction, ou l'entête « — » */
  for (const l of lines){
    if (l === out.name) continue;
    const m = l.match(ROLE_HINT);
    if (m && l.length <= 60){ out.role = l.replace(/^[-–—•·|]\s*/, '').trim(); break; }
  }
  /* dériver un nom de l'email si aucune ligne n'a donné (p.nom@x → P. Nom) */
  if (!out.name && out.email){
    const local = out.email.split('@')[0].replace(/\d+/g, '');
    const parts = local.split(/[._-]+/).filter(p => p.length > 1);
    if (parts.length >= 2)
      out.name = parts.slice(0, 2).map(p => p[0].toUpperCase() + p.slice(1)).join(' ');
  }
  return (out.name || out.email || out.phone) ? out : null;
}
