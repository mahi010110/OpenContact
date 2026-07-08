/* ============================================================
   OpenContact — interface · « Mes pistes »
   La liste cherchable (mobile) devient un tableau à 3 colonnes
   sur desktop — le poste de commandement. Le bac « Contacts à
   rattacher » vit ici ; les clôturées restent repliées en bas.
   ============================================================ */
import { esc } from '../engine/utils.js';
import { STATUSES, CLOSE_REASONS, DOMAINS } from '../engine/model.js';
import { scoreOf } from '../engine/score.js';
import { filterCompanies } from '../engine/filter.js';
import { S, bus, isClosed, hasDemo, addDemo, ctLabel } from './state.js';
import { $, ic, toast } from './dom.js';
import { relLabel } from './dates.js';
import { openFiche } from './fiche.js';
import { openCapture } from './capture.js';
import { openContactEditor, openAttach } from './contact.js';
import { openProspect } from './prospect.js';

let q = '';

/* liste ⇄ tableau : on re-rend au franchissement du breakpoint */
const mqWide = matchMedia('(min-width:901px)');
mqWide.addEventListener('change', () => { if (S.route === 'pistes') renderPistes(); });

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

function cardHTML(c){
  const bits = [c.city, c.domain !== 'autre' ? DOMAINS[c.domain].label : ''].filter(Boolean);
  const na = c.nextAction
    ? `<span class="bc-na">${esc(c.nextActionText || 'Faire le point')} · <em class="${relLabel(c.nextAction).startsWith('–') ? 'late' : ''}">${relLabel(c.nextAction)}</em></span>`
    : '<span class="bc-na bc-none">pas de prochaine action</span>';
  const foot = [];
  if ((c.contacts || []).length) foot.push(ic('contact', 'ic-14') + ' ' + c.contacts.length);
  foot.push('complète à ' + scoreOf(c) + ' %');
  return (
    `<button class="bcard" data-id="${c.id}">
       <b>${esc(c.name)}</b>
       ${bits.length ? `<span class="bc-sub">${bits.map(esc).join(' · ')}</span>` : ''}
       ${na}
       <span class="bc-foot">${foot.join(' · ')}</span>
     </button>`);
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
                   <button class="btn btn-sm btn-primary" data-attach="${o.id}">Rattacher</button>
                 </div>`;
       }).join('')}</div>
       <p class="hint">Un contact vit mieux dans sa fiche entreprise — rattache-le dès que tu sais où.</p>
     </details>`);
}

export function renderPistes(){
  const root = $('#view-pistes');
  const wide = mqWide.matches;
  const all = filterCompanies(S.companies, { q, sort: 'recent' });
  const alive = all.filter(c => !isClosed(c));
  const closed = all.filter(isClosed);
  const nAlive = S.companies.filter(c => !isClosed(c)).length;

  let html =
    `<div class="page-inner${wide ? ' page-wide' : ''}">
       <div class="td-head">
         <h2>Mes pistes</h2>
         <div class="td-date">${S.companies.length} piste${S.companies.length > 1 ? 's' : ''}</div>
         ${nAlive ? `<button class="btn btn-sm" id="piProspect">${ic('mail', 'ic-14')} Prospecter</button>` : ''}
       </div>
       <div class="search-wrap">
         <input class="search" id="piQ" type="search" placeholder="Chercher : entreprise, contact, ville, techno…"
                aria-label="Rechercher une piste" value="${esc(q)}">
       </div>
       ${orphansHTML()}`;
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
  const openById = id => {
    const c = S.companies.find(x => x.id === id);
    if (c) openFiche(c);
  };
  root.querySelectorAll('.row-item').forEach(r => {
    r.addEventListener('click', () => openById(r.dataset.id));
    r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openById(r.dataset.id); } });
  });
  root.querySelectorAll('.bcard').forEach(b =>
    b.addEventListener('click', () => openById(b.dataset.id)));
  /* bac : la ligne édite, le bouton rattache */
  root.querySelectorAll('.orow').forEach(r => {
    const o = () => S.orphans.find(x => x.id === r.dataset.oid);
    const edit = () => { const ct = o(); if (ct) openContactEditor({ contact: ct }); };
    r.querySelector('.o-main').addEventListener('click', edit);
    r.querySelector('.o-main').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); edit(); }
    });
    r.querySelector('[data-attach]').addEventListener('click', () => { const ct = o(); if (ct) openAttach(ct); });
  });
  root.querySelector('#piProspect')?.addEventListener('click', openProspect);
  root.querySelector('#piAdd')?.addEventListener('click', () => openCapture());
  root.querySelector('#piDemo')?.addEventListener('click', () => { addDemo(); bus.refresh(); toast('Exemple ajouté — retire-le depuis « Aujourd’hui ».'); });
}
