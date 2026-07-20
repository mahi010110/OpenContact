/* ============================================================
   OpenContact — interface · « Mes pistes »
   La liste cherchable (mobile) devient un tableau à 3 colonnes
   sur desktop — le poste de commandement. Le bac « Contacts à
   rattacher » vit ici ; les clôturées restent repliées en bas.
   Supprimer une piste = un geste (glisser / poubelle au survol)
   + Annuler ~30 s — c'est le seul endroit où l'on supprime.
   ============================================================ */
import { esc, distKm } from '../engine/utils.js';
import { STATUSES, CLOSE_REASONS, DOMAINS, pushHist } from '../engine/model.js';
import { scoreOf } from '../engine/score.js';
import { filterCompanies } from '../engine/filter.js';
import { S, bus, isClosed, hasDemo, addDemo, ctLabel, deletePiste, undeletePiste, saveData, logJ } from './state.js';
import { $, ic, toast, showUndo, bindDeleteGesture, openSheet } from './dom.js';
import { sortState, sortArgs, sortHasDist, sortBarHTML, bindSortBar } from './sort.js';
import { relLabel } from './dates.js';
import { openFiche } from './fiche.js';
import { openCapture } from './capture.js';
import { openContactEditor, openAttach } from './contact.js';
import { openProspect } from './prospect.js';
import { campaignOfPiste } from './campagnes.js';

let q = '';
const st = sortState('recent');

/* filtre de vue (le temps de la session, comme le tri) : au plus un
   statut + un domaine — le moteur (filter.js) fait le reste */
const ft = { status: '', domain: '' };
const ftOn = () => !!(ft.status || ft.domain);
const ftClear = () => { ft.status = ''; ft.domain = ''; };

/* au-delà de ce cap, la suite s'ouvre d'un tap (« Voir les N autres ») :
   2 000 lignes d'un coup gelaient l'écran ~250 ms à chaque frappe */
const CAP_LIST = 60;
const CAP_COL = 40;
const expanded = new Set();          /* tranches dépliées (le temps de la session) */
function capped(items, key, cap){
  if (items.length <= cap || expanded.has(key)) return { shown: items, more: 0 };
  return { shown: items.slice(0, cap), more: items.length - cap };
}
const moreBtn = (key, n) =>
  `<button class="linklike tr-more" data-more="${key}">Voir les ${n} autres</button>`;

/* liste ⇄ tableau : on re-rend au franchissement du breakpoint */
const mqWide = matchMedia('(min-width:901px)');
mqWide.addEventListener('change', () => { if (S.route === 'pistes') renderPistes(); });

/* en tri « Près de moi » (à n'importe quel niveau), la distance s'affiche */
const kmBit = c => (sortHasDist(st) && st.userPos && c.lat != null)
  ? Math.round(distKm(st.userPos.lat, st.userPos.lng, c.lat, c.lng)) + ' km' : '';

function rowHTML(c){
  const closed = isClosed(c);
  const color = closed ? CLOSE_REASONS[c.closedReason].color : STATUSES[c.status].color;
  /* le verbe d'action d'abord — jamais tronqué (la ligne peut plier) */
  const bits = [];
  if (closed) bits.push('<b>' + CLOSE_REASONS[c.closedReason].label + '</b>');
  else if (c.nextAction) bits.push('<b>' + esc(c.nextActionText || 'Faire le point') + '</b> · ' + relLabel(c.nextAction));
  else if (campaignOfPiste(c.id)) bits.push('en campagne');
  else bits.push('à planifier');
  if (!closed && c.nextAction && campaignOfPiste(c.id)) bits.push('en campagne');
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
  const inCamp = campaignOfPiste(c.id);
  const na = c.nextAction
    ? `<span class="bc-na">${esc(c.nextActionText || 'Faire le point')} · <em class="${relLabel(c.nextAction).startsWith('–') ? 'late' : ''}">${relLabel(c.nextAction)}</em></span>`
    : `<span class="bc-na bc-none">${inCamp ? 'en campagne' : 'à planifier'}</span>`;
  const foot = [];
  if ((c.contacts || []).length) foot.push(ic('contact', 'ic-14') + ' ' + c.contacts.length);
  foot.push('complète à ' + scoreOf(c) + ' %');
  return (
    `<div class="bcard" data-id="${c.id}" draggable="true">
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
    const { shown, more } = capped(col, 'col-' + k, CAP_COL);
    return `<section class="bcol" data-st="${k}" aria-label="${STATUSES[k].label}">
              <h3 class="bcol-h" style="--c:${STATUSES[k].color}">${STATUSES[k].label} <span class="tr-n">${col.length}</span></h3>
              <div class="bcol-rows">${shown.map(cardHTML).join('') || '<div class="bcol-empty">—</div>'}${more ? moreBtn('col-' + k, more) : ''}</div>
            </section>`;
  }).join('')}</div>`;
}

/* déposer une carte dans une autre colonne = changer le statut — même
   trace qu'un « Confirmer » de fiche : une entrée d'historique propre */
function moveStatus(id, k){
  const c = S.companies.find(x => x.id === id);
  if (!c || isClosed(c) || !STATUSES[k] || c.status === k) return;
  c.status = k;
  pushHist(c, 'Statut → ' + STATUSES[k].label);
  logJ(c.name + ' — Statut → ' + STATUSES[k].label, c.id);
  c.updatedAt = Date.now();
  saveData();
  bus.refresh();
  toast(c.name + ' → ' + STATUSES[k].label);   /* toast affiche du texte brut : esc() doublerait l'échappement */
}

/* le tableau se manipule à la souris : glisser une carte vers une autre
   colonne (HTML5, desktop) — la fiche reste le chemin universel */
function bindBoardDrag(body){
  let dragId = null;
  const clearHints = () =>
    body.querySelectorAll('.bcol.drop-ok').forEach(x => x.classList.remove('drop-ok'));
  body.querySelectorAll('.bcard').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragId = card.dataset.id;
      card.classList.add('drag-src');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('drag-src');
      clearHints();
      dragId = null;
    });
  });
  body.querySelectorAll('.bcol').forEach(col => {
    col.addEventListener('dragover', e => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearHints();
      col.classList.add('drop-ok');
    });
    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('drop-ok');
    });
    col.addEventListener('drop', e => {
      e.preventDefault();
      clearHints();
      const id = dragId || e.dataTransfer.getData('text/plain');
      if (id) moveStatus(id, col.dataset.st);
    });
  });
}

/* le bouton « Filtrer » à côté du tri — actif = marqué, re-tap = tout montrer */
function filterBtnHTML(){
  const names = [ft.status && STATUSES[ft.status].label, ft.domain && DOMAINS[ft.domain].label]
    .filter(Boolean).join(' + ');
  const lbl = ftOn() ? `Filtre : ${names} — retaper pour tout montrer` : 'Filtrer';
  return `<button class="btn icon-btn${ftOn() ? ' sort-on' : ''}" id="piFilt"
                  aria-label="${esc(lbl)}" title="${esc(lbl)}">${ic('filter', 'ic-14')}</button>`;
}

/* la feuille « Filtrer » — même grammaire que « Trier » : chaque tap
   s'applique aussitôt, la croix referme, le bouton actif re-tapé montre
   tout. Le statut n'est proposé qu'en liste (le tableau segmente déjà). */
function openFilterSheet(onChange){
  const sh = openSheet({ title: 'Filtrer', icon: 'filter' });
  const render = () => {
    const chips = (grp, defs, cur) => Object.keys(defs).map(k =>
      `<button class="fl-chip${cur === k ? ' on' : ''}" data-${grp}="${k}" aria-pressed="${cur === k}">
         <span class="dotc" style="background:${defs[k].color}"></span>${defs[k].label}</button>`).join('');
    sh.body.innerHTML =
      `${mqWide.matches ? '' :
        `<div class="lbl-row"><label>Statut</label></div>
         <div class="fl-grid">${chips('st', STATUSES, ft.status)}</div>`}
       <div class="lbl-row"><label>Domaine</label></div>
       <div class="fl-grid">${chips('dom', DOMAINS, ft.domain)}</div>`;
    sh.body.querySelectorAll('[data-st]').forEach(b =>
      b.addEventListener('click', () => {
        ft.status = (ft.status === b.dataset.st) ? '' : b.dataset.st;
        onChange(); render();
      }));
    sh.body.querySelectorAll('[data-dom]').forEach(b =>
      b.addEventListener('click', () => {
        ft.domain = (ft.domain === b.dataset.dom) ? '' : b.dataset.dom;
        onChange(); render();
      }));
  };
  render();
}

function orphansHTML(){
  if (!S.orphans.length) return '';
  return (
    `<details class="tranche tr-orph" open>
       <summary class="tr-h">${ic('contact', 'ic-14')} Contacts à rattacher <span class="tr-n">${S.orphans.length}</span></summary>
       <div class="rows">${S.orphans.map(o => {
         const title = ctLabel(o);
         const sameAsTitle = v => String(v || '').trim().toLocaleLowerCase() === String(title).trim().toLocaleLowerCase();
         const contact = [o.email, o.phone].filter(v => v && !sameAsTitle(v))[0] || '';
         const sub = [o.role, contact, (o.extra && o.extra.company) ? '→ ' + o.extra.company + ' ?' : '']
           .filter(Boolean).map(esc).join(' · ');
         return `<div class="orow" data-oid="${o.id}">
                   <div class="o-main" role="button" tabindex="0" aria-label="Modifier ${esc(title)}">
                     <h4>${esc(title)}</h4>
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
         ${filterBtnHTML()}
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
    const all = filterCompanies(S.companies, { q, status: ft.status, domain: ft.domain, ...sortArgs(st) });
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
      html +=
        `<div class="empty-list">Rien ne correspond${q ? ` à « ${esc(q)} »` : ' au filtre'}.
           ${ftOn() ? '<button class="linklike" id="piFtClear">Tout montrer</button>' : ''}
         </div>`;
    } else {
      if (wide) html += boardHTML(alive);
      else {
        const { shown, more } = capped(alive, 'list', CAP_LIST);
        html += `<div class="rows">${shown.map(rowHTML).join('')}${more ? moreBtn('list', more) : ''}</div>`;
      }
      if (closed.length){
        const { shown, more } = capped(closed, 'closed', CAP_LIST);
        html +=
          `<details class="tranche tr-closed">
             <summary class="tr-h">${ic('archive', 'ic-14')} Clôturées <span class="tr-n">${closed.length}</span></summary>
             <div class="rows">${shown.map(rowHTML).join('')}${more ? moreBtn('closed', more) : ''}</div>
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
    if (wide && body.querySelector('.board')) bindBoardDrag(body);
    body.querySelector('#piFtClear')?.addEventListener('click', () => { ftClear(); renderPistes(); });
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
    body.querySelectorAll('[data-more]').forEach(b =>
      b.addEventListener('click', e => {
        e.stopPropagation();
        expanded.add(b.dataset.more);
        renderBody();
      }));
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
  root.querySelector('#piFilt').addEventListener('click', () => {
    /* re-tap sur un filtre actif = tout montrer (comme le tri) */
    if (ftOn()){ ftClear(); renderPistes(); return; }
    openFilterSheet(renderPistes);
  });
  root.querySelector('#piProspect')?.addEventListener('click', openProspect);
  renderBody();
}
