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
export const PRIVATE_CAMPAIGNS_MAX = 200;
export const PRIVATE_MISSIONS_MAX = 400;

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

/* ---------- campagnes et bons de mission privés ----------
   Ces deux collections empruntent le MÊME canal que les fiches, mais
   ne font jamais partie d'un partage communautaire ni d'un OCQ. Une
   campagne peut être mise à jour sur l'ordinateur (journal replié) et
   sur le téléphone (réponse, reprise en main) : le plus récent fournit
   la forme, puis les faits irréversibles sont réunis. */
const campaignTime = c => Number(c && c.updatedAt) || 0;
const stateRank = s => ({ active: 0, done: 1, error: 2, replied: 3 }[s] ?? 0);
const stablePick = (a, b) => JSON.stringify(a) <= JSON.stringify(b) ? a : b;

function mergeCampaignRecord(remote, local){
  const rt = campaignTime(remote), lt = campaignTime(local);
  let base = rt > lt ? remote : lt > rt ? local : stablePick(remote, local);
  const other = base === remote ? local : remote;
  base = Object.assign({}, base);

  /* Un `sid` déjà consigné ne peut jamais disparaître : c'est le verrou
     PWA contre une relance après convergence de deux appareils. */
  const logs = Object.create(null);
  for (const e of [...(base.log || []), ...(other.log || [])]){
    if (!e || !e.sid) continue;
    if (!logs[e.sid]) logs[e.sid] = e;
  }
  base.log = Object.values(logs);

  const otherTargets = Object.create(null);
  for (const t of (other.targets || [])) if (t && t.tid) otherTargets[t.tid] = t;
  base.targets = (base.targets || []).map(t => {
    const o = otherTargets[t.tid];
    if (!o || stateRank(t.state) >= stateRank(o.state)) return t;
    return Object.assign({}, t, { state: o.state });
  });
  if (base.state === 'ready' && base.targets.length && !base.targets.some(t => t.state === 'active'))
    base.state = 'done';
  /* Arrêter est irréversible ; un état plus récent peut en revanche
     départager proprement pause/reprise et auto/manuelle. */
  if (remote.state === 'stopped' || local.state === 'stopped') base.state = 'stopped';
  base.updatedAt = Math.max(rt, lt);
  return base;
}

export function mergeCampaigns(remote, local){
  const by = Object.create(null);
  for (const c of (local || [])) if (c && c.id) by[c.id] = c;
  for (const c of (remote || [])){
    if (!c || !c.id) continue;
    by[c.id] = by[c.id] ? mergeCampaignRecord(c, by[c.id]) : c;
  }
  return Object.values(by)
    .sort((a, b) => campaignTime(b) - campaignTime(a) || String(a.id).localeCompare(String(b.id)))
    .slice(0, PRIVATE_CAMPAIGNS_MAX);
}

const missionRank = s => ({ a_confier: 0, confiee: 1, revoquee: 2 }[s] ?? -1);
function missionWireKey(rec){
  const w = rec && rec.wire;
  return w && typeof w.m === 'string' && typeof w.sig === 'string' && typeof w.dev === 'string'
    ? JSON.stringify([w.m, w.sig, w.dev]) : '';
}
function validMission(rec){
  const wk = missionWireKey(rec);
  if (!rec || !rec.mid || !rec.cpId || !wk || missionRank(rec.state) < 0) return false;
  try {
    const m = JSON.parse(rec.wire.m);
    return m && m.mid === rec.mid && m.kind === 'campaign-run' &&
      m.params && m.params.campaign && m.params.campaign.id === rec.cpId;
  } catch (e) { return false; }
}
function mergeMissionRecord(remote, local){
  /* Même `mid`, fils différents : on garde UN fil entier, choisi de
     façon déterministe. Aucun champ du contenu signé n'est recomposé. */
  if (missionWireKey(remote) !== missionWireKey(local))
    return missionWireKey(remote) < missionWireKey(local) ? remote : local;
  const state = missionRank(remote.state) > missionRank(local.state) ? remote.state : local.state;
  const stops = Array.from(new Set([...(local.stops || []), ...(remote.stops || [])]
    .filter(x => typeof x === 'string' && x))).sort();
  return Object.assign({}, local, { state, stops, revOk: !!(local.revOk || remote.revOk) });
}

export function mergeMissions(remote, local){
  const by = Object.create(null);
  for (const m of (local || [])) if (validMission(m)) by[m.mid] = m;
  for (const m of (remote || [])){
    if (!validMission(m)) continue;
    by[m.mid] = by[m.mid] ? mergeMissionRecord(m, by[m.mid]) : m;
  }
  return Object.values(by).sort((a, b) => String(a.mid).localeCompare(String(b.mid)))
    .slice(-PRIVATE_MISSIONS_MAX);
}

export function syncPrivateMerge(remote, local){
  const campaigns = mergeCampaigns(remote && remote.campaigns, local && local.campaigns);
  const missions = mergeMissions(remote && remote.missions, local && local.missions);
  return {
    campaigns, missions,
    stats: {
      campaigns: JSON.stringify(campaigns) === JSON.stringify((local && local.campaigns) || []) ? 0 : 1,
      missions: JSON.stringify(missions) === JSON.stringify((local && local.missions) || []) ? 0 : 1
    }
  };
}
