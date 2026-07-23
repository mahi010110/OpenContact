/* ============================================================
   OpenContact — moteur · fusion communautaire
   Ajoute l'inconnu, complète le vide, ne touche jamais à
   l'existant. Reçoit la liste de pistes en paramètre — jamais
   d'état global, jamais de DOM.
   ============================================================ */
import { uid, todayISO, normName, extractCity, distKm } from './utils.js';
import { normalizeCompany } from './model.js';

export function contactKey(ct){
  const e = (ct.email || '').trim().toLowerCase();
  if (e) return 'e:' + e;
  const p = (ct.phone || '').replace(/\D/g, '');
  if (p) return 'p:' + p;
  const n = normName((ct.name || '') + '|' + (ct.role || ''));
  return n ? 'n:' + n : '';
}
export function findMatch(x, companies){
  const nk = normName(x.name);
  if (!nk) return null;
  const xCity = normName(x.city || extractCity(x.address));
  const cands = companies.filter(c => normName(c.name) === nk);
  if (!cands.length) return null;
  const loose = [];
  for (const c of cands){
    const cCity = normName(c.city || extractCity(c.address));
    if (xCity && cCity){ if (xCity === cCity) return c; continue; }
    if (typeof x.lat === 'number' && c.lat != null){
      if (distKm(x.lat, x.lng, c.lat, c.lng) < 30) return c;
      continue;
    }
    loose.push(c);
  }
  /* B8 : sans discriminant, on ne fusionne que si un seul homonyme est plausible */
  return loose.length === 1 ? loose[0] : null;
}
/* Fusion non destructive. Complète la liste `companies` reçue (ajouts +
   enrichissements) et retourne des statistiques, dont le compteur de
   divergences (D2) : deux valeurs non vides différentes → rien n'est
   écrasé, mais l'utilisateur est prévenu. */
export function mergeIncoming(list, companies){
  const stats = { addedC: 0, enriched: 0, addedCt: 0, conflicts: 0 };
  const differ = (a, b) => String(a).trim() !== String(b).trim();
  for (const rawC of list){
    const x = normalizeCompany(rawC);
    (x.contacts || []).forEach(ct => {
      if (ct.conf === 'ok') ct.conf = 'doubt';                                       /* S5 */
      delete ct.activatedAt;    /* #14 : le suivi privé ne s'importe jamais — */
      ct.src = 'promo';         /* un contact reçu = nom connu, zéro to-do   */
    });
    const ex = findMatch(x, companies);
    if (!ex){
      x.id = uid(); x.demo = false;
      x.status = 'todo'; x.notes = ''; x.appliedAt = ''; x.nextAction = '';          /* le privé ne s'importe jamais */
      x.nextActionText = ''; x.closedAt = ''; x.closedReason = '';
      delete x.nextActionCt;                                                         /* #14 */
      x.history = [{ d: todayISO(), t: 'Reçue via partage' }];
      companies.push(x);
      stats.addedC++;
    } else {
      let touched = false;
      for (const f of ['desc','address','city','website','techs','process','tips']){
        if (!ex[f] && x[f]){ ex[f] = String(x[f]); touched = true; }
        else if (ex[f] && x[f] && differ(ex[f], x[f])) stats.conflicts++;
      }
      if ((!ex.positions || !ex.positions.length) && x.positions.length){ ex.positions = x.positions; touched = true; }
      else if (ex.positions.length && x.positions.length &&
               ex.positions.slice().sort().join() !== x.positions.slice().sort().join()) stats.conflicts++;
      if (ex.lat == null && typeof x.lat === 'number' && typeof x.lng === 'number'){ ex.lat = x.lat; ex.lng = x.lng; touched = true; }
      if ((x.confirmations || 0) > (ex.confirmations || 0)){ ex.confirmations = x.confirmations; touched = true; }
      if (x.verifiedAt && x.verifiedAt > (ex.verifiedAt || '')){ ex.verifiedAt = x.verifiedAt; touched = true; }
      if (x.extra){                                                                   /* D3 */
        for (const k of Object.keys(x.extra)){
          if (!ex.extra || ex.extra[k] === undefined){ (ex.extra = ex.extra || {})[k] = x.extra[k]; touched = true; }
        }
      }
      const keys = {};
      (ex.contacts || []).forEach(ct => { const k = contactKey(ct); if (k) keys[k] = ct; });
      for (const nc of (x.contacts || [])){
        const k = contactKey(nc);
        if (!k) continue;
        const known = keys[k];
        if (known){
          for (const f of ['name','role','email','phone','link','note']){
            if (!known[f] && nc[f]){ known[f] = nc[f]; touched = true; }
            else if (known[f] && nc[f] && differ(known[f], nc[f])) stats.conflicts++;
          }
          if (!known.conf && nc.conf){ known.conf = nc.conf; touched = true; }
        } else {
          ex.contacts.push(nc); keys[k] = nc;
          stats.addedCt++; touched = true;
        }
      }
      if (touched){ ex.updatedAt = Date.now(); stats.enriched++; }
    }
  }
  return stats;
}
