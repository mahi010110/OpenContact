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
import { $, ic, toast, showUndo, bindDeleteGesture, openSheet, softReorder } from './dom.js';
import { sortState, sortArgs, sortHasDist,
         sortSectionHTML, bindSortSection, sortChipHTML, bindSortChip } from './sort.js';
import { relLabel } from './dates.js';
import { openFiche } from './fiche.js';
import { openCapture } from './capture.js';
import { openContactEditor, openAttach } from './contact.js';
import { openProspect } from './prospect.js';
import { campaignOfPiste, liveCampaignsCount, openCampaignsHome } from './campagnes.js';

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
  /* le verbe d'action d'abord — jamais tronqué (la ligne peut plier) ;
     le statut UNE seule fois : la pastille texte + couleur (#13) */
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
         <div class="ri-main" role="button" tabindex="0" aria-label="Ouvrir ${esc(c.name)}">
           <h3>${esc(c.name)}</h3>
           <div class="ri-sub">${bits.join(' · ')}</div>
         </div>
         ${!closed ? `<span class="ri-st" style="--c:${STATUSES[c.status].color}">${STATUSES[c.status].label}</span>` : ''}
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

/* la feuille « Affiner » (#8) : filtres + tri, une seule surface, même
   grammaire partout — chaque tap s'applique aussitôt, la croix referme.
   Le statut n'est proposé qu'en liste (le tableau desktop segmente déjà) ;
   le tri multi-niveaux vit replié dans la section « Trier ». */
function openAffinerSheet(onChange){
  const sh = openSheet({ title: 'Affiner', icon: 'filter' });
  const render = () => {
    const chips = (grp, defs, cur) => Object.keys(defs).map(k =>
      `<button class="fl-chip${cur === k ? ' on' : ''}" data-${grp}="${k}" aria-pressed="${cur === k}">
         <span class="dotc" style="background:${defs[k].color}"></span>${defs[k].label}</button>`).join('');
    sh.body.innerHTML =
      `${mqWide.matches ? '' :
        `<div class="lbl-row"><label>Statut</label></div>
         <div class="fl-grid">${chips('st', STATUSES, ft.status)}</div>`}
       <div class="lbl-row"><label>Domaine</label></div>
       <div class="fl-grid">${chips('dom', DOMAINS, ft.domain)}</div>
       ${sortSectionHTML(st)}`;
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
    bindSortSection(sh.body, st, () => { onChange(); render(); });
  };
  render();
}

/* l'état actif = des puces sous la recherche, un regard suffit (#8) —
   la croix enlève, taper la puce de tri inverse son sens */
function chipsRowHTML(){
  const bits = [];
  if (ft.status) bits.push(
    `<span class="st-chip"><button class="st-chip-b" data-clear="st" aria-label="Retirer le filtre ${STATUSES[ft.status].label}">
       <span class="dotc" style="background:${STATUSES[ft.status].color}"></span>${STATUSES[ft.status].label}</button>
     <button class="st-chip-x" data-clear-x="st" aria-label="Retirer le filtre">✕</button></span>`);
  if (ft.domain) bits.push(
    `<span class="st-chip"><button class="st-chip-b" data-clear="dom" aria-label="Retirer le filtre ${DOMAINS[ft.domain].label}">
       <span class="dotc" style="background:${DOMAINS[ft.domain].color}"></span>${DOMAINS[ft.domain].label}</button>
     <button class="st-chip-x" data-clear-x="dom" aria-label="Retirer le filtre">✕</button></span>`);
  const sc = sortChipHTML(st);
  if (sc) bits.push(sc);
  return bits.length ? `<div class="chips-row">${bits.join('')}</div>` : '';
}

function orphansHTML(){
  if (!S.orphans.length) return '';
  /* ligne calme, repliée (#13) : présente, mais ne vole plus la place */
  return (
    `<details class="tranche tr-orph">
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

  const nCamps = liveCampaignsCount();
  root.innerHTML =
    `<div class="page-inner${wide ? ' page-wide' : ''}">
       <div class="td-head">
         <h2>Mes pistes</h2>
         <div class="td-date">${S.companies.length} piste${S.companies.length > 1 ? 's' : ''}</div>
         ${nCamps ? `<button class="btn btn-sm" id="piCamps">${ic('flag', 'ic-14')} Campagnes (${nCamps})</button>` : ''}
         ${nAlive ? `<button class="btn btn-sm" id="piProspect">${ic('mail', 'ic-14')} Prospecter</button>` : ''}
       </div>
       <div class="search-wrap">
         <input class="search" id="piQ" type="search" placeholder="Chercher…"
                aria-label="Rechercher une piste" value="${esc(q)}">
         <button class="btn" id="piAffiner">${ic('filter', 'ic-14')} Affiner</button>
       </div>
       <div id="piChips">${chipsRowHTML()}</div>
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
  /* les puces d'état et le corps se re-rendent ensemble, la recherche
     reste le même nœud (le curseur ne saute pas) ; les lignes retrouvées
     glissent vers leur nouvelle place (#23) */
  const refresh = () => {
    const play = softReorder('#piBody .row-item, #piBody .bcard');
    const chips = root.querySelector('#piChips');
    chips.innerHTML = chipsRowHTML();
    bindChips(chips);
    renderBody();
    play();
  };
  const bindChips = box => {
    box.querySelectorAll('[data-clear], [data-clear-x]').forEach(b =>
      b.addEventListener('click', () => {
        const grp = b.dataset.clear || b.dataset.clearX;
        if (grp === 'st') ft.status = '';
        else ft.domain = '';
        refresh();
      }));
    bindSortChip(box, st, refresh);
  };
  bindChips(root.querySelector('#piChips'));
  root.querySelector('#piAffiner').addEventListener('click', () => openAffinerSheet(refresh));
  root.querySelector('#piProspect')?.addEventListener('click', openProspect);
  root.querySelector('#piCamps')?.addEventListener('click', openCampaignsHome);
  renderBody();
}
