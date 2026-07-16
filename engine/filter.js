/* ============================================================
   OpenContact — moteur · recherche, filtres & tris
   Reçoit les pistes ET les critères en paramètres, rend la liste
   ordonnée : l'interface lit ses champs, le moteur ne lit jamais
   l'écran. Tri multi-niveaux (3 max) : `sorts` = [{sort, dir}] —
   principal puis départages, chacun avec son sens (`dir` vide =
   sens naturel, NATURAL_DIR). Motif décorer-trier : chaque clé
   est calculée UNE fois par piste, jamais dans le comparateur —
   des milliers de pistes restent un O(n log n) bon marché.
   Les pistes sans valeur (pas d'action, pas de coordonnées)
   restent en fin de liste quel que soit le sens.
   ============================================================ */
import { DOMAINS, STATUSES, POSITIONS } from './model.js';
import { scoreOf } from './score.js';
import { distKm } from './utils.js';

export const NATURAL_DIR = {
  recent: 'desc', action: 'asc', dist: 'asc', score: 'desc',
  az: 'asc', status: 'asc', contacts: 'desc'
};
export const SORT_LEVELS_MAX = 3;

const collator = new Intl.Collator('fr');
const STATUS_ORD = Object.keys(STATUSES);
/* la clé d'un critère — null = « pas de valeur », toujours en fin */
const KEY_FNS = {
  recent:   c => c.updatedAt || 0,
  az:       c => c.name,
  action:   c => c.nextAction || null,
  score:    c => scoreOf(c),
  status:   c => STATUS_ORD.indexOf(c.status),
  contacts: c => (c.contacts || []).length,
  dist:     (c, pos) => c.lat == null ? null : distKm(pos.lat, pos.lng, c.lat, c.lng)
};
const STR_KEY = { az: 1, action: 1 };   /* comparées par collation, pas par soustraction */

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
  /* niveaux : `sorts` (multi) sinon le couple {sort, dir} historique ;
     un critère inconnu — ou « dist » sans position — est ignoré */
  let levels = (opts && Array.isArray(opts.sorts) && opts.sorts.length)
    ? opts.sorts : [{ sort, dir }];
  levels = levels
    .filter(l => l && KEY_FNS[l.sort] && (l.sort !== 'dist' || userPos))
    .slice(0, SORT_LEVELS_MAX);
  if (!levels.length) levels = [{ sort: 'recent', dir: '' }];
  const signs = levels.map(l => ((l.dir || NATURAL_DIR[l.sort] || 'desc') === 'asc') ? 1 : -1);
  const strs = levels.map(l => STR_KEY[l.sort] || 0);
  /* décorer : toutes les clés d'un coup, une passe O(n) */
  const deco = arr.map(c => ({ c, k: levels.map(l => KEY_FNS[l.sort](c, userPos)) }));
  deco.sort((A, B) => {
    for (let i = 0; i < levels.length; i++){
      const va = A.k[i], vb = B.k[i];
      if (va == null || vb == null){                 /* sans valeur : en fin, quel que soit le sens */
        if (va != null) return -1;
        if (vb != null) return 1;
        continue;
      }
      const d = strs[i] ? collator.compare(va, vb) : va - vb;
      if (d) return signs[i] * d;
    }
    return (B.c.updatedAt || 0) - (A.c.updatedAt || 0);   /* départage final : les récentes d'abord */
  });
  return deco.map(x => x.c);
}
