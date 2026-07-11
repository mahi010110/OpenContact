/* ============================================================
   OpenContact — moteur · recherche, filtres & tris
   Reçoit les pistes ET les critères en paramètres, rend la liste
   ordonnée : l'interface lit ses champs, le moteur ne lit jamais
   l'écran.
   ============================================================ */
import { DOMAINS, STATUSES, POSITIONS } from './model.js';
import { scoreOf } from './score.js';
import { distKm } from './utils.js';

function blobOf(c){
  const cts = (c.contacts || []).map(t => [t.name, t.role, t.email, t.phone, t.note].join(' ')).join(' ');
  const pos = (c.positions || []).map(p => POSITIONS[p]).join(' ');
  return [c.name, c.city, c.address, c.desc, c.techs, c.tips, c.process,
          DOMAINS[c.domain]?.label, pos, cts].join(' ').toLowerCase();
}
export function filterCompanies(companies, opts){
  const { domain = '', status = '', sort = 'recent', userPos = null } = opts || {};
  const q = String((opts && opts.q) || '').trim().toLowerCase();
  const arr = companies.filter(c => {
    if (domain && c.domain !== domain) return false;
    if (status && c.status !== status) return false;
    if (q && !blobOf(c).includes(q)) return false;
    return true;
  });
  if (sort === 'score') arr.sort((a,b) => scoreOf(b) - scoreOf(a));
  else if (sort === 'az') arr.sort((a,b) => a.name.localeCompare(b.name, 'fr'));
  else if (sort === 'action'){
    /* la prochaine action la plus proche d'abord (le retard en tête),
       les pistes sans rien de prévu à la fin */
    const k = c => c.nextAction || '9999-99-99';
    arr.sort((a,b) => k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  else if (sort === 'dist' && userPos){
    const dv = c => (c.lat == null) ? Infinity : distKm(userPos.lat, userPos.lng, c.lat, c.lng);
    arr.sort((a,b) => dv(a) - dv(b) || (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  else if (sort === 'status'){
    const ord = Object.keys(STATUSES);
    arr.sort((a,b) => ord.indexOf(a.status) - ord.indexOf(b.status) || (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  else if (sort === 'contacts'){
    arr.sort((a,b) => ((b.contacts || []).length - (a.contacts || []).length) || (scoreOf(b) - scoreOf(a)));
  }
  else arr.sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return arr;
}
