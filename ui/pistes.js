/* ============================================================
   OpenContact — interface · « Mes pistes »
   Une seule vue : la liste cherchable. Les vivantes d'abord,
   les clôturées repliées en bas. Tap = fiche. (L'édition complète
   et le bac « à rattacher » s'étoffent à l'étape 2.)
   ============================================================ */
import { esc } from '../engine/utils.js';
import { STATUSES, CLOSE_REASONS, DOMAINS } from '../engine/model.js';
import { filterCompanies } from '../engine/filter.js';
import { S, bus, isClosed, hasDemo, addDemo } from './state.js';
import { $, ic, toast } from './dom.js';
import { relLabel } from './dates.js';
import { openFiche } from './fiche.js';
import { openCapture } from './capture.js';

let q = '';

function rowHTML(c){
  const closed = isClosed(c);
  const color = closed ? CLOSE_REASONS[c.closedReason].color : STATUSES[c.status].color;
  const bits = [];
  if (c.city) bits.push(esc(c.city));
  if (c.domain !== 'autre') bits.push(esc(DOMAINS[c.domain].label));
  if (closed) bits.push('<b>' + CLOSE_REASONS[c.closedReason].label + '</b>');
  else if (c.nextAction) bits.push(esc(c.nextActionText || 'Faire le point') + ' · ' + relLabel(c.nextAction));
  else bits.push('pas de prochaine action');
  return (
    `<div class="row-item${closed ? ' row-closed' : ''}" data-id="${c.id}" role="button" tabindex="0">
       <span class="dotc" style="background:${color}"></span>
       <div class="ri-main">
         <h3>${esc(c.name)}</h3>
         <div class="ri-sub">${bits.join(' · ')}</div>
       </div>
       ${!closed ? `<span class="ri-st" style="--c:${color}">${STATUSES[c.status].label}</span>` : ''}
     </div>`);
}

export function renderPistes(){
  const root = $('#view-pistes');
  const all = filterCompanies(S.companies, { q, sort: 'recent' });
  const alive = all.filter(c => !isClosed(c));
  const closed = all.filter(isClosed);

  let html =
    `<div class="page-inner">
       <div class="td-head">
         <h2>Mes pistes</h2>
         <div class="td-date">${S.companies.length} piste${S.companies.length > 1 ? 's' : ''}</div>
       </div>
       <div class="search-wrap">
         <input class="search" id="piQ" type="search" placeholder="Chercher : entreprise, contact, ville, techno…"
                aria-label="Rechercher une piste" value="${esc(q)}">
       </div>`;
  if (!S.companies.length){
    html +=
      `<div class="td-empty">
         <div class="tde-ic">${ic('briefcase', 'ic-24')}</div>
         <h3>Aucune piste pour l’instant</h3>
         <p>Chaque entreprise croisée est une piste — même avec juste un nom.</p>
         <div class="tde-actions">
           <button class="btn btn-primary" id="piAdd">${ic('plus', 'ic-14')} Ajouter une piste</button>
           ${!hasDemo() ? '<button class="btn" id="piDemo">Voir un exemple</button>' : ''}
         </div>
       </div>`;
  } else if (!all.length){
    html += `<div class="empty-list">Rien ne correspond à « ${esc(q)} ».</div>`;
  } else {
    html += `<div class="rows">${alive.map(rowHTML).join('')}</div>`;
    if (closed.length){
      html +=
        `<details class="tranche tr-closed">
           <summary class="tr-h">${ic('archive', 'ic-14')} Clôturées <span class="tr-n">${closed.length}</span></summary>
           <div class="rows">${closed.map(rowHTML).join('')}</div>
         </details>`;
    }
  }
  html += '</div>';
  root.innerHTML = html;

  const input = root.querySelector('#piQ');
  if (input){
    let h = null;
    input.addEventListener('input', () => {
      clearTimeout(h);
      h = setTimeout(() => {
        q = input.value;
        renderPistes();
        const nq = root.querySelector('#piQ');
        nq.focus();
        nq.setSelectionRange(nq.value.length, nq.value.length);
      }, 220);
    });
  }
  root.querySelectorAll('.row-item').forEach(r => {
    const open = () => {
      const c = S.companies.find(x => x.id === r.dataset.id);
      if (c) openFiche(c);
    };
    r.addEventListener('click', open);
    r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); } });
  });
  root.querySelector('#piAdd')?.addEventListener('click', () => openCapture());
  root.querySelector('#piDemo')?.addEventListener('click', () => { addDemo(); bus.refresh(); toast('Exemple ajouté — retire-le depuis « Aujourd’hui ».'); });
}
