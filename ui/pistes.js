/* ============================================================
   OpenContact — interface · « Mes pistes »
   La liste cherchable (mobile) devient un tableau à 3 colonnes
   sur desktop — le poste de commandement. Le bac « Contacts à
   rattacher » vit ici ; les clôturées restent repliées en bas.
   Supprimer une piste = un geste (glisser / poubelle au survol)
   + Annuler ~30 s — c'est le seul endroit où l'on supprime.
   ============================================================ */
import { esc, distKm } from '../engine/utils.js';
import { STATUSES, CLOSE_REASONS, DOMAINS } from '../engine/model.js';
import { scoreOf } from '../engine/score.js';
import { filterCompanies } from '../engine/filter.js';
import { S, bus, isClosed, hasDemo, addDemo, ctLabel, deletePiste, undeletePiste } from './state.js';
import { $, ic, toast, showUndo, bindDeleteGesture } from './dom.js';
import { sortState, sortBarHTML, bindSortBar } from './sort.js';
import { relLabel } from './dates.js';
import { openFiche } from './fiche.js';
import { openCapture } from './capture.js';
import { openContactEditor, openAttach } from './contact.js';
import { openProspect } from './prospect.js';

let q = '';
const st = sortState('recent');

/* liste ⇄ tableau : on re-rend au franchissement du breakpoint */
const mqWide = matchMedia('(min-width:901px)');
mqWide.addEventListener('change', () => { if (S.route === 'pistes') renderPistes(); });

/* en tri « Près de moi », la distance s'affiche — sinon rien ne change */
const kmBit = c => (st.sort === 'dist' && st.userPos && c.lat != null)
  ? Math.round(distKm(st.userPos.lat, st.userPos.lng, c.lat, c.lng)) + ' km' : '';

function rowHTML(c){
  const closed = isClosed(c);
  const color = closed ? CLOSE_REASONS[c.closedReason].color : STATUSES[c.status].color;
  /* le verbe d'action d'abord — jamais tronqué (la ligne peut plier) */
  const bits = [];
  if (closed) bits.push('<b>' + CLOSE_REASONS[c.closedReason].label + '</b>');
  else if (c.nextAction) bits.push('<b>' + esc(c.nextActionText || 'Faire le point') + '</b> · ' + relLabel(c.nextAction));
  else bits.push('à planifier');
  if (kmBit(c)) bits.push(kmBit(c));
  if (c.city) bits.push(esc(c.city));
  return (
    `<div class="row-item${closed ? ' row-closed' : ''}" data-id="${c.id}">
       <div class="sw-in">
         <span class="dotc" style="background:${color}"></span>
         <div class="ri-main" role="button" tabindex="0" aria-label="Ouvrir ${esc(c.name)}">
           <h3>${esc(c.name)}</h3>
           <div class="ri-sub">${bits.join(' · ')}</div>
         </div>
         ${!closed ? `<span class="ri-st" style="--c:${color}">${STATUSES[c.status].label}</span>` : ''}
       </div>
     </div>`);
}

function cardHTML(c){
  const bits = [kmBit(c), c.city, c.domain !== 'autre' ? DOMAINS[c.domain].label : ''].filter(Boolean);
  const na = c.nextAction
    ? `<span class="bc-na">${esc(c.nextActionText || 'Faire le point')} · <em class="${relLabel(c.nextAction).startsWith('–') ? 'late' : ''}">${relLabel(c.nextAction)}</em></span>`
    : '<span class="bc-na bc-none">à planifier</span>';
  const foot = [];
  if ((c.contacts || []).length) foot.push(ic('contact', 'ic-14') + ' ' + c.contacts.length);
  foot.push('complète à ' + scoreOf(c) + ' %');
  return (
    `<div class="bcard" data-id="${c.id}">
       <div class="sw-in">
         <div class="bc-main" role="button" tabindex="0" aria-label="Ouvrir ${esc(c.name)}">
           <b>${esc(c.name)}</b>
           ${bits.length ? `<span class="bc-sub">${bits.map(esc).join(' · ')}</span>` : ''}
           ${na}
           <span class="bc-foot">${foot.join(' · ')}</span>
         </div>
       </div>
     </div>`);
}

function boardHTML(alive){
  return `<div class="board">${Object.keys(STATUSES).map(k => {
    const col = alive.filter(c => c.status === k);
    return `<section class="bcol" aria-label="${STATUSES[k].label}">
              <h3 class="bcol-h" style="--c:${STATUSES[k].color}">${STATUSES[k].label} <span class="tr-n">${col.length}</span></h3>
              <div class="bcol-rows">${col.map(cardHTML).join('') || '<div class="bcol-empty">—</div>'}</div>
            </section>`;
  }).join('')}</div>`;
}

function orphansHTML(){
  if (!S.orphans.length) return '';
  return (
    `<details class="tranche tr-orph" open>
       <summary class="tr-h">${ic('contact', 'ic-14')} Contacts à rattacher <span class="tr-n">${S.orphans.length}</span></summary>
       <div class="rows">${S.orphans.map(o => {
         const sub = [o.role, o.email || o.phone, (o.extra && o.extra.company) ? '→ ' + o.extra.company + ' ?' : '']
           .filter(Boolean).map(esc).join(' · ');
         return `<div class="orow" data-oid="${o.id}">
                   <div class="o-main" role="button" tabindex="0" aria-label="Modifier ${esc(ctLabel(o))}">
                     <h4>${esc(ctLabel(o))}</h4>
                     <div class="o-sub">${sub || 'à compléter'}</div>
                   </div>
                   <button class="btn btn-sm" data-attach="${o.id}">Rattacher</button>
                 </div>`;
       }).join('')}</div>
     </details>`);
}

/* suppression d'une piste : le geste a déjà eu lieu — Annuler ~30 s */
function removeRow(id){
  const c = S.companies.find(x => x.id === id);
  if (!c) return;
  deletePiste(c);
  bus.refresh();
  showUndo(`${ic('check', 'ic-14')} « ${esc(c.name)} » supprimée.`, () => {
    undeletePiste(c);
    bus.refresh();
    toast('Piste restaurée.');
  });
}

export function renderPistes(){
  const root = $('#view-pistes');
  const wide = mqWide.matches;
  const nAlive = S.companies.filter(c => !isClosed(c)).length;
  /* en descendant : la tête s'efface, recherche + tri restent collés (CSS) */
  root.onscroll = () => root.classList.toggle('scrolled', root.scrollTop > 8);

  root.innerHTML =
    `<div class="page-inner${wide ? ' page-wide' : ''}">
       <div class="td-head">
         <h2>Mes pistes</h2>
         <div class="td-date">${S.companies.length} piste${S.companies.length > 1 ? 's' : ''}</div>
         ${nAlive ? `<button class="btn btn-sm" id="piProspect">${ic('mail', 'ic-14')} Prospecter</button>` : ''}
       </div>
       <div class="search-wrap">
         <input class="search" id="piQ" type="search" placeholder="Chercher…"
                aria-label="Rechercher une piste" value="${esc(q)}">
         ${sortBarHTML(st)}
       </div>
       <div id="piBody"></div>
     </div>`;

  const openById = id => {
    const c = S.companies.find(x => x.id === id);
    if (c) openFiche(c);
  };

  /* le corps se re-rend seul pendant la frappe — le champ de recherche
     reste le même nœud, le curseur ne saute plus */
  const renderBody = () => {
    const body = root.querySelector('#piBody');
    const all = filterCompanies(S.companies, { q, sort: st.sort, dir: st.dir, userPos: st.userPos });
    const alive = all.filter(c => !isClosed(c));
    const closed = all.filter(isClosed);

    let html = orphansHTML();
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
      html += wide ? boardHTML(alive) : `<div class="rows">${alive.map(rowHTML).join('')}</div>`;
      if (closed.length){
        html +=
          `<details class="tranche tr-closed">
             <summary class="tr-h">${ic('archive', 'ic-14')} Clôturées <span class="tr-n">${closed.length}</span></summary>
             <div class="rows">${closed.map(rowHTML).join('')}</div>
           </details>`;
      }
    }
    body.innerHTML = html;

    body.querySelectorAll('.row-item, .bcard').forEach(r => {
      const open = () => openById(r.dataset.id);
      r.addEventListener('click', open);
      r.querySelector('[role="button"]').addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); }
      });
      bindDeleteGesture(r, () => removeRow(r.dataset.id));
    });
    /* bac : la ligne édite, le bouton rattache */
    body.querySelectorAll('.orow').forEach(r => {
      const o = () => S.orphans.find(x => x.id === r.dataset.oid);
      const edit = () => { const ct = o(); if (ct) openContactEditor({ contact: ct }); };
      r.querySelector('.o-main').addEventListener('click', edit);
      r.querySelector('.o-main').addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); edit(); }
      });
      r.querySelector('[data-attach]').addEventListener('click', () => { const ct = o(); if (ct) openAttach(ct); });
    });
    body.querySelector('#piAdd')?.addEventListener('click', () => openCapture());
    body.querySelector('#piDemo')?.addEventListener('click', () => { addDemo(); bus.refresh(); toast('Exemple ajouté — retire-le depuis « Aujourd’hui ».'); });
  };

  const input = root.querySelector('#piQ');
  let h = null;
  input.addEventListener('input', () => {
    clearTimeout(h);
    h = setTimeout(() => { q = input.value; renderBody(); }, 180);
  });
  bindSortBar(root, st, renderPistes);
  root.querySelector('#piProspect')?.addEventListener('click', openProspect);
  renderBody();
}
