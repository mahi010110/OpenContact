/* ============================================================
   OpenContact — moteur · missions du Compagnon (contrat)
   Une mission est un bon de travail borné que la PWA confie au
   Compagnon (l'app locale facultative) : exécuter les envois
   d'une campagne app fermée, ou analyser un périmètre d'e-mails.
   Le contrat tient en trois règles (SPECIFICATIONS §8.2) :
   · IDEMPOTENTE — un identifiant stable ; deux canaux ou une
     reconnexion ne font jamais le travail deux fois (les envois
     rapportés se replient sur le journal de campagne, qui refuse
     les doublons par construction) ;
   · BORNÉE — une portée et une expiration ;
   · RÉVOCABLE — depuis OpenContact, à tout moment.
   Un résultat d'analyse d'e-mails est une enveloppe `share`
   ordinaire : elle repasse par parseInput → aperçu avant fusion,
   jamais une écriture directe. Fonctions pures, aucun DOM.
   ============================================================ */
import { markSent } from './campaign.js';

export const MISSION_KINDS = ['campaign-run', 'mail-scan'];
export const MISSION_TTL = { 'campaign-run': 30, 'mail-scan': 2 };   /* jours */

const DAY = 86400000;
export function makeMission(kind, params, opts){
  if (!MISSION_KINDS.includes(kind)) throw new Error('mission');
  opts = opts || {};
  const at = opts.at || Date.now();
  return {
    v: 1,
    mid: opts.mid || ('ms' + at.toString(36) + Math.random().toString(36).slice(2, 8)),
    kind,
    params: params || {},
    createdAt: at,
    expiresAt: at + (opts.ttlDays || MISSION_TTL[kind]) * DAY,
    revoked: false
  };
}
export function missionUsable(m, now){
  return !!m && m.v === 1 && MISSION_KINDS.includes(m.kind) &&
         !m.revoked && (now || Date.now()) < (m.expiresAt || 0);
}
export function revokeMission(m){
  return Object.assign({}, m, { revoked: true });
}

/* le rapport d'une mission campagne : { mid, sent: [{sid, at}] }.
   Replié sur la campagne par markSent — même rapport rejoué, autre
   canal, redémarrage : le journal refuse les doublons. */
export function foldCampaignReport(campaign, report){
  let c = campaign;
  for (const s of ((report && report.sent) || [])){
    if (!s || !s.sid) continue;
    c = markSent(c, s.sid, s.at || '');
  }
  return c;
}
