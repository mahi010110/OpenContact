/* ============================================================
   OpenContact — moteur · synchronisation entre MES appareils
   Rien à voir avec la fusion communautaire (merge.js, qui protège
   l'existant et exclut le privé) : ici les deux côtés sont à la
   même personne, donc TOUT circule (privé inclus) et le plus
   récent gagne, piste par piste (LWW sur updatedAt).
   Les suppressions voyagent par tombstones : { id, t } — une
   pierre plus récente que la fiche l'emporte ; une fiche modifiée
   après la suppression ressuscite (c'est voulu : le geste le plus
   récent gagne, quel que soit l'appareil).
   Fonctions pures — jamais d'état global, jamais d'écran.
   ============================================================ */
import { normalizeCompany, normalizeContact, normalizeProfile } from './model.js';

export const TOMBS_MAX = 500;

/* union de deux listes de tombstones — par id, la plus récente gagne.
   Les maps indexées par id sont sans prototype : une clé « __proto__ »
   venue du réseau doit rester une donnée, pas un détournement. */
export function mergeTombs(a, b){
  const by = Object.create(null);
  for (const t of [...(a || []), ...(b || [])]){
    if (!t || !t.id) continue;
    const ts = Number(t.t) || 0;
    if (!by[t.id] || ts > by[t.id].t) by[t.id] = { id: t.id, t: ts };
  }
  return Object.values(by).sort((x, y) => y.t - x.t).slice(0, TOMBS_MAX);
}

/* fusion complète d'un instantané distant dans l'état local.
   local / remote : { companies, orphans, profile, tombs }.
   Retourne le nouvel état + des statistiques — sans muter les entrées. */
export function syncMerge(remote, local){
  remote = remote || {};
  local = local || {};
  const stats = { addedC: 0, updatedC: 0, removedC: 0, addedO: 0, profile: 'local' };
  const tombs = mergeTombs(local.tombs, remote.tombs);
  const dead = Object.create(null);
  tombs.forEach(t => { dead[t.id] = t.t; });

  const byId = Object.create(null);
  const wasLocal = Object.create(null);
  for (const c of (local.companies || [])){
    byId[c.id] = c;
    wasLocal[c.id] = true;
  }
  for (const raw of (remote.companies || [])){
    if (!raw || !raw.id) continue;
    const r = normalizeCompany(raw);
    const mine = byId[r.id];
    if (mine){
      if ((r.updatedAt || 0) > (mine.updatedAt || 0)){ byId[r.id] = r; stats.updatedC++; }
    } else {
      byId[r.id] = r;
      if (!(dead[r.id] >= (r.updatedAt || 0))) stats.addedC++;
    }
  }
  const companies = [];
  for (const id of Object.keys(byId)){
    if (dead[id] >= (byId[id].updatedAt || 0)){
      if (wasLocal[id]) stats.removedC++;
      continue;
    }
    companies.push(byId[id]);
  }

  /* contacts « à rattacher » : union par id (pas d'horodatage → l'existant gagne) */
  const orphans = (local.orphans || []).slice();
  const oIds = Object.create(null);
  orphans.forEach(o => { oIds[o.id] = true; });
  for (const raw of (remote.orphans || [])){
    if (!raw || !raw.id || oIds[raw.id]) continue;
    orphans.push(normalizeContact(raw));
    oIds[raw.id] = true;
    stats.addedO++;
  }

  /* profil : celui qui a été enregistré en dernier gagne, en bloc */
  let profile = local.profile || null;
  const rp = remote.profile;
  if (rp && (Number(rp.updatedAt) || 0) > ((profile && Number(profile.updatedAt)) || 0)){
    profile = normalizeProfile(rp);
    stats.profile = 'remote';
  }

  return { companies, orphans, profile, tombs, stats };
}
