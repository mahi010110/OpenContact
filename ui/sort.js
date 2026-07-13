/* ============================================================
   OpenContact — interface · tri partagé (multi-niveaux)
   Le même contrôle dans Mes pistes, Prospecter et Donner : un
   bouton « Trier » et une bascule ↑/↓ (sens du critère principal).
   La feuille montre la pile des niveaux (principal + départages,
   3 max) : taper la flèche d'un niveau inverse SON sens, ✕ le
   retire, la liste en dessous ajoute un départage. Chaque tap
   fait une chose et s'applique aussitôt — la croix referme.
   Re-taper le bouton « Trier » quand un tri est actif = retour
   direct au défaut de l'écran. Le moteur (filter.js) reste seul
   juge de l'ordre.
   ============================================================ */
import { NATURAL_DIR, SORT_LEVELS_MAX } from '../engine/filter.js';
import { openSheet, toast, ic } from './dom.js';

export const SORT_LABELS = {
  recent: 'Récentes',
  action: 'À faire',
  status: 'Statut',
  score:  'Complètes',
  az:     'A → Z',
  dist:   'Près de moi'
};

/* l'état d'un écran : pile de niveaux [{sort, dir}] ('' = sens naturel),
   position (pour « Près de moi ») et critère par défaut */
export function sortState(def){
  return { levels: [{ sort: def, dir: '' }], userPos: null, def };
}
/* les arguments de tri pour filterCompanies */
export const sortArgs = st => ({ sorts: st.levels, userPos: st.userPos });
export const sortHasDist = st => st.levels.some(l => l.sort === 'dist');
const effDir = l => l.dir || NATURAL_DIR[l.sort] || 'desc';
const isDefault = st =>
  st.levels.length === 1 && st.levels[0].sort === st.def && !st.levels[0].dir;
/* inverse le sens d'un niveau (stocké '' quand il retombe sur le naturel) */
function flipDir(l){
  const next = effDir(l) === 'asc' ? 'desc' : 'asc';
  l.dir = (next === (NATURAL_DIR[l.sort] || 'desc')) ? '' : next;
}

export function sortBarHTML(st){
  const main = st.levels[0];
  const on = !isDefault(st);
  const names = st.levels.map(l => SORT_LABELS[l.sort]).join(' puis ');
  const lbl = on ? `Tri : ${names} — retaper pour revenir à « ${SORT_LABELS[st.def]} »`
                 : `Trier — ${SORT_LABELS[main.sort]}`;
  return (
    `<button class="btn icon-btn${on ? ' sort-on' : ''}" data-sort-crit
             aria-label="${lbl}" title="${lbl}">${ic('sort-vertical', 'ic-14')}</button>
     <button class="btn icon-btn${main.dir ? ' sort-on' : ''}" data-sort-dir
             aria-label="Ordre — ${effDir(main) === 'asc' ? 'croissant' : 'décroissant'}" title="Inverser l’ordre">${ic(effDir(main) === 'asc' ? 'arrow-up' : 'arrow-down', 'ic-14')}</button>`);
}

export function bindSortBar(root, st, onChange){
  root.querySelector('[data-sort-crit]').addEventListener('click', () => {
    /* re-tap sur un tri actif = retour direct au défaut de l'écran */
    if (!isDefault(st)){
      st.levels = [{ sort: st.def, dir: '' }];
      onChange();
      return;
    }
    openSortSheet(st, onChange);
  });
  root.querySelector('[data-sort-dir]').addEventListener('click', () => {
    flipDir(st.levels[0]);
    onChange();
  });
}

/* demande la position puis applique — « Près de moi » seulement */
function withPos(st, apply){
  if (st.userPos){ apply(); return; }
  if (!navigator.geolocation){ toast('Pas de géolocalisation sur ce navigateur.'); return; }
  navigator.geolocation.getCurrentPosition(
    p => { st.userPos = { lat: p.coords.latitude, lng: p.coords.longitude }; apply(); },
    () => toast('Position indisponible — tri par proximité impossible.'),
    { timeout: 8000, maximumAge: 300000 }
  );
}

function openSortSheet(st, onChange){
  const sh = openSheet({ title: 'Trier', icon: 'sort-vertical' });
  const render = () => {
    const used = st.levels.map(l => l.sort);
    const rest = Object.keys(SORT_LABELS).filter(k => !used.includes(k));
    sh.body.innerHTML =
      `<div class="srt-stack">
         ${st.levels.map((l, i) =>
           `<div class="srt-lv">
              <span class="srt-n">${i + 1}</span><b>${SORT_LABELS[l.sort]}</b>
              <button class="btn icon-btn" data-flip="${i}"
                      aria-label="${SORT_LABELS[l.sort]} — sens ${effDir(l) === 'asc' ? 'croissant' : 'décroissant'}, taper pour inverser"
                      title="Inverser le sens">${ic(effDir(l) === 'asc' ? 'arrow-up' : 'arrow-down', 'ic-14')}</button>
              <button class="btn icon-btn" data-rm="${i}"
                      aria-label="Retirer ${SORT_LABELS[l.sort]}" title="Retirer">✕</button>
            </div>`).join('')}
       </div>
       ${st.levels.length < SORT_LEVELS_MAX && rest.length
         ? `<div class="lbl-row"><label>Puis par</label></div>
            <div class="pick-list">
              ${rest.map(k => `<button class="pick" data-add="${k}"><b>${SORT_LABELS[k]}</b></button>`).join('')}
            </div>`
         : `<p class="hint" style="margin:0">${SORT_LEVELS_MAX} niveaux max — retire-en un pour changer.</p>`}`;
    const apply = () => { onChange(); render(); };
    sh.body.querySelectorAll('[data-flip]').forEach(b =>
      b.addEventListener('click', () => { flipDir(st.levels[+b.dataset.flip]); apply(); }));
    sh.body.querySelectorAll('[data-rm]').forEach(b =>
      b.addEventListener('click', () => {
        st.levels.splice(+b.dataset.rm, 1);
        if (!st.levels.length) st.levels = [{ sort: st.def, dir: '' }];
        apply();
      }));
    sh.body.querySelectorAll('[data-add]').forEach(b =>
      b.addEventListener('click', () => {
        const k = b.dataset.add;
        const add = () => {
          /* la pile encore au défaut intact : le premier tap CHOISIT le
             critère principal (comme avant) au lieu d'empiler derrière */
          if (isDefault(st)) st.levels = [{ sort: k, dir: '' }];
          else st.levels.push({ sort: k, dir: '' });
          apply();
        };
        if (k === 'dist') withPos(st, add);
        else add();
      }));
  };
  render();
}
