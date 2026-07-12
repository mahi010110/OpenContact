/* ============================================================
   OpenContact — moteur · recherche, filtres & tris
   Reçoit les pistes ET les critères en paramètres, rend la liste
   ordonnée : l'interface lit ses champs, le moteur ne lit jamais
   l'écran. Chaque critère a un sens naturel (NATURAL_DIR) ; `dir`
   l'inverse. Les pistes sans valeur (pas d'action, pas de
   coordonnées) restent en fin de liste quel que soit le sens.
   ============================================================ */
import { DOMAINS, STATUSES, POSITIONS } from './model.js';
import { scoreOf } from './score.js';
import { distKm } from './utils.js';

export const NATURAL_DIR = {
  recent: 'desc', action: 'asc', dist: 'asc', score: 'desc',
  az: 'asc', status: 'asc', contacts: 'desc'
};

function blobOf(c){
  const cts = (c.contacts || []).map(t => [t.name, t.role, t.email, t.phone, t.note].join(' ')).join(' ');
  const pos = (c.positions || []).map(p => POSITIONS[p]).join(' ');
  return [c.name, c.city, c.address, c.desc, c.techs, c.tips, c.process,
          DOMAINS[c.domain]?.label, pos, cts].join(' ').toLowerCase();
}
export function filterCompanies(companies, opts){
  const { domain = '', status = '', sort = 'recent', dir = '', userPos = null } = opts || {};
  const q = String((opts && opts.q) || '').trim().toLowerCase();
  const arr = companies.filter(c => {
    if (domain && c.domain !== domain) return false;
    if (status && c.status !== status) return false;
    if (q && !blobOf(c).includes(q)) return false;
    return true;
  });
  const s = (dir && dir !== (NATURAL_DIR[sort] || 'desc')) ? -1 : 1;
  const rec = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
  /* le score est calculé une fois par piste, pas à chaque comparaison
     (scoreOf parse des dates — O(n log n) appels ruinaient le tri) */
  const sv = (sort === 'score' || sort === 'contacts')
    ? new Map(arr.map(c => [c, scoreOf(c)])) : null;
  if (sort === 'score') arr.sort((a, b) => s * (sv.get(b) - sv.get(a)) || rec(a, b));
  else if (sort === 'az') arr.sort((a, b) => s * a.name.localeCompare(b.name, 'fr'));
  else if (sort === 'action'){
    /* la prochaine action la plus proche d'abord (le retard en tête) */
    arr.sort((a, b) => {
      if (!a.nextAction && !b.nextAction) return rec(a, b);
      if (!a.nextAction) return 1;
      if (!b.nextAction) return -1;
      return s * a.nextAction.localeCompare(b.nextAction) || rec(a, b);
    });
  }
  else if (sort === 'dist' && userPos){
    const dv = c => (c.lat == null) ? Infinity : distKm(userPos.lat, userPos.lng, c.lat, c.lng);
    arr.sort((a, b) => {
      const da = dv(a), db = dv(b);
      if (da === Infinity && db === Infinity) return rec(a, b);
      if (da === Infinity) return 1;
      if (db === Infinity) return -1;
      return s * (da - db) || rec(a, b);
    });
  }
  else if (sort === 'status'){
    const ord = Object.keys(STATUSES);
    arr.sort((a, b) => s * (ord.indexOf(a.status) - ord.indexOf(b.status)) || rec(a, b));
  }
  else if (sort === 'contacts'){
    arr.sort((a, b) => s * ((b.contacts || []).length - (a.contacts || []).length) || (sv.get(b) - sv.get(a)));
  }
  else arr.sort((a, b) => s * rec(a, b));
  return arr;
}
