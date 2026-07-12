/* ============================================================
   OpenContact — interface · tri partagé (critère + ordre)
   Le même contrôle dans Mes pistes, Prospecter et Donner : un
   bouton « Trier » (feuille de critères — re-taper l'actif =
   retour au défaut de l'écran) et une bascule ↑ / ↓. Chaque
   critère s'ouvre dans son sens naturel (moteur, NATURAL_DIR).
   ============================================================ */
import { NATURAL_DIR } from '../engine/filter.js';
import { openSheet, toast, btn, ic } from './dom.js';

export const SORT_LABELS = {
  recent: 'Récentes',
  action: 'À faire',
  status: 'Statut',
  score:  'Complètes',
  az:     'A → Z',
  dist:   'Près de moi'
};

/* l'état d'un écran : critère, ordre forcé ('' = sens naturel),
   position (pour « Près de moi ») et critère par défaut */
export function sortState(def){
  return { sort: def, dir: '', userPos: null, def };
}
const effDir = st => st.dir || NATURAL_DIR[st.sort] || 'desc';

export function sortBarHTML(st){
  const arrow = effDir(st) === 'asc' ? 'arrow-up' : 'arrow-down';
  return (
    `<button class="btn icon-btn${st.sort !== st.def ? ' sort-on' : ''}" data-sort-crit
             aria-label="Trier — ${SORT_LABELS[st.sort]}" title="Trier — ${SORT_LABELS[st.sort]}">${ic('sort-vertical', 'ic-14')}</button>
     <button class="btn icon-btn${st.dir ? ' sort-on' : ''}" data-sort-dir
             aria-label="Ordre — ${effDir(st) === 'asc' ? 'croissant' : 'décroissant'}" title="Inverser l’ordre">${ic(arrow, 'ic-14')}</button>`);
}

export function bindSortBar(root, st, onChange){
  root.querySelector('[data-sort-crit]').addEventListener('click', () => openSortSheet(st, onChange));
  root.querySelector('[data-sort-dir]').addEventListener('click', () => {
    const next = effDir(st) === 'asc' ? 'desc' : 'asc';
    st.dir = (next === (NATURAL_DIR[st.sort] || 'desc')) ? '' : next;
    onChange();
  });
}

function openSortSheet(st, onChange){
  const sh = openSheet({ title: 'Trier par', icon: 'sort-vertical' });
  sh.body.innerHTML =
    `<div class="pick-list">
       ${Object.keys(SORT_LABELS).map(k =>
         `<button class="pick" data-k="${k}" aria-pressed="${st.sort === k}">
            <b>${SORT_LABELS[k]}</b>${st.sort === k ? ic('check', 'ic-14') : ''}
          </button>`).join('')}
     </div>`;
  const apply = k => {
    st.sort = k;
    st.dir = '';
    sh.close();
    onChange();
  };
  sh.body.querySelectorAll('.pick').forEach(b =>
    b.addEventListener('click', () => {
      const k = b.dataset.k;
      if (k === st.sort){ apply(st.def); return; }   /* re-tap = retour au défaut */
      if (k !== 'dist'){ apply(k); return; }
      if (!navigator.geolocation){ toast('Pas de géolocalisation sur ce navigateur.'); return; }
      navigator.geolocation.getCurrentPosition(
        p => { st.userPos = { lat: p.coords.latitude, lng: p.coords.longitude }; apply('dist'); },
        () => toast('Position indisponible — tri par proximité impossible.'),
        { timeout: 8000, maximumAge: 300000 }
      );
    }));
  sh.setFoot([btn('Fermer', 'btn-ghost', () => sh.close())]);
}
