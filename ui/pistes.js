/* ============================================================
   OpenContact — interface · « Mes pistes »
   La liste cherchable (mobile) devient un tableau à 3 colonnes
   sur desktop — le poste de commandement. Le bac « Contacts à
   rattacher » vit ici ; les clôturées restent repliées en bas.
   ============================================================ */
import { esc, distKm } from '../engine/utils.js';
import { STATUSES, CLOSE_REASONS, DOMAINS } from '../engine/model.js';
import { scoreOf } from '../engine/score.js';
import { filterCompanies } from '../engine/filter.js';
import { S, bus, isClosed, hasDemo, addDemo, ctLabel, deletePiste, undeletePiste } from './state.js';
import { $, ic, toast, openSheet, btn, confirmSheet, showUndo } from './dom.js';
import { relLabel } from './dates.js';
import { openFiche } from './fiche.js';
import { openCapture } from './capture.js';
import { openContactEditor, openAttach } from './contact.js';
import { openProspect } from './prospect.js';

let q = '';

/* tri : peu d'options, les bonnes — « Récentes » reste l'ordre naturel */
const SORTS = {
  recent: ['Récentes', 'dernière activité en tête'],
  action: ['À faire', 'prochaine action la plus proche d’abord'],
  dist:   ['Près de moi', 'les plus proches d’abord — il faut ta position'],
  score:  ['Fiches complètes', 'les mieux renseignées d’abord'],
  az:     ['A → Z', 'ordre alphabétique']
};
let sort = 'recent';
let userPos = null;

/* mode sélection : appui long sur une ligne (mobile) ou bouton à côté
   du tri — cocher, puis UNE décision (Supprimer n) + Annuler ~30 s */
let selMode = false;
const selIds = new Set();
let longPressAt = 0;

function openSortSheet(){
  const sh = openSheet({ title: 'Trier les pistes', icon: 'sort-vertical' });
  const apply = k => {
    sort = k;
    sh.close();
    renderPistes();
  };
  sh.body.innerHTML =
    `<div class="pick-list">
       ${Object.keys(SORTS).map(k =>
         `<button class="pick" data-k="${k}" aria-pressed="${sort === k}">
            <b>${SORTS[k][0]}${sort === k ? ' ' + ic('check', 'ic-14') : ''}</b>
            <span>${SORTS[k][1]}</span>
          </button>`).join('')}
     </div>`;
  sh.body.querySelectorAll('.pick').forEach(b =>
    b.addEventListener('click', () => {
      const k = b.dataset.k;
      if (k !== 'dist'){ apply(k); return; }
      if (!navigator.geolocation){ toast('Pas de géolocalisation sur ce navigateur.'); return; }
      navigator.geolocation.getCurrentPosition(
        p => { userPos = { lat: p.coords.latitude, lng: p.coords.longitude }; apply('dist'); },
        () => toast('Position indisponible — tri par proximité impossible.'),
        { timeout: 8000, maximumAge: 300000 }
      );
    }));
  sh.setFoot([btn('Fermer', 'btn-ghost', () => sh.close())]);
}

/* liste ⇄ tableau : on re-rend au franchissement du breakpoint */
const mqWide = matchMedia('(min-width:901px)');
mqWide.addEventListener('change', () => { if (S.route === 'pistes') renderPistes(); });

/* en tri « Près de moi », la distance s'affiche — sinon rien ne change */
const kmBit = c => (sort === 'dist' && userPos && c.lat != null)
  ? Math.round(distKm(userPos.lat, userPos.lng, c.lat, c.lng)) + ' km' : '';

function rowHTML(c){
  const closed = isClosed(c);
  const color = closed ? CLOSE_REASONS[c.closedReason].color : STATUSES[c.status].color;
  const bits = [];
  if (kmBit(c)) bits.push(kmBit(c));
  if (c.city) bits.push(esc(c.city));
  if (c.domain !== 'autre') bits.push(esc(DOMAINS[c.domain].label));
  if (closed) bits.push('<b>' + CLOSE_REASONS[c.closedReason].label + '</b>');
  else if (c.nextAction) bits.push(esc(c.nextActionText || 'Faire le point') + ' · ' + relLabel(c.nextAction));
  else bits.push('pas de prochaine action');
  return (
    `<div class="row-item${closed ? ' row-closed' : ''}${selMode && selIds.has(c.id) ? ' on' : ''}" data-id="${c.id}" role="button" tabindex="0"
          ${selMode ? `aria-pressed="${selIds.has(c.id)}"` : ''}>
       ${selMode ? ic('checkbox', 'ic-20 ic-off') + ic('checkbox-on', 'ic-20 ic-on') : `<span class="dotc" style="background:${color}"></span>`}
       <div class="ri-main">
         <h3>${esc(c.name)}</h3>
         <div class="ri-sub">${bits.join(' · ')}</div>
       </div>
       ${!closed ? `<span class="ri-st" style="--c:${color}">${STATUSES[c.status].label}</span>` : ''}
     </div>`);
}

function cardHTML(c){
  const bits = [kmBit(c), c.city, c.domain !== 'autre' ? DOMAINS[c.domain].label : ''].filter(Boolean);
  const na = c.nextAction
    ? `<span class="bc-na">${esc(c.nextActionText || 'Faire le point')} · <em class="${relLabel(c.nextAction).startsWith('–') ? 'late' : ''}">${relLabel(c.nextAction)}</em></span>`
    : '<span class="bc-na bc-none">pas de prochaine action</span>';
  const foot = [];
  if ((c.contacts || []).length) foot.push(ic('contact', 'ic-14') + ' ' + c.contacts.length);
  foot.push('complète à ' + scoreOf(c) + ' %');
  return (
    `<button class="bcard${selMode && selIds.has(c.id) ? ' on' : ''}" data-id="${c.id}"${selMode ? ` aria-pressed="${selIds.has(c.id)}"` : ''}>
       ${selMode ? `<span class="bc-check">${ic('checkbox', 'ic-20 ic-off')}${ic('checkbox-on', 'ic-20 ic-on')}</span>` : ''}
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
     </details>`);
}

/* sortie du mode sélection — la barre et les coches disparaissent */
function exitSel(){
  selMode = false;
  selIds.clear();
}
/* suppression groupée : UNE confirmation, tombstones, Annuler ~30 s */
async function deleteSelected(){
  const list = S.companies.filter(c => selIds.has(c.id));
  if (!list.length) return;
  const n = list.length;
  const names = list.slice(0, 3).map(c => esc(c.name)).join(', ') + (n > 3 ? ` et ${n - 3} autre${n > 4 ? 's' : ''}` : '');
  const ok = await confirmSheet({
    title: n > 1 ? `Supprimer ${n} pistes ?` : 'Supprimer cette piste ?',
    danger: true, okLabel: 'Supprimer', icon: 'trash',
    msg: `<b>${names}</b> — supprimée${n > 1 ? 's' : ''} aussi de tes appareils synchronisés.`
  });
  if (!ok) return;
  list.forEach(deletePiste);
  exitSel();
  bus.refresh();
  showUndo(`${ic('check', 'ic-14')} ${n} piste${n > 1 ? 's' : ''} supprimée${n > 1 ? 's' : ''}.`, () => {
    list.forEach(undeletePiste);
    bus.refresh();
    toast(n > 1 ? 'Pistes restaurées.' : 'Piste restaurée.');
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
         ${nAlive && !selMode ? `<button class="btn btn-sm" id="piProspect">${ic('mail', 'ic-14')} Prospecter</button>` : ''}
       </div>
       <div class="search-wrap">
         <input class="search" id="piQ" type="search" placeholder="Chercher : entreprise, contact, ville, techno…"
                aria-label="Rechercher une piste" value="${esc(q)}">
         <button class="btn icon-btn${sort !== 'recent' ? ' btn-primary' : ''}" id="piSort"
                 aria-label="Trier — ${SORTS[sort][0]}" title="Trier — ${SORTS[sort][0]}">${ic('sort-vertical', 'ic-14')}</button>
         ${S.companies.length ? `<button class="btn icon-btn${selMode ? ' btn-primary' : ''}" id="piSel"
                 aria-label="Sélectionner des pistes" title="Sélectionner">${ic('checkbox', 'ic-14')}</button>` : ''}
       </div>
       <div id="piBody"></div>
     </div>`;

  const openById = id => {
    if (Date.now() - longPressAt < 600) return;   /* le clic fantôme après l'appui long */
    if (selMode){ toggleSel(id); return; }
    const c = S.companies.find(x => x.id === id);
    if (c) openFiche(c);
  };
  const syncBar = () => {
    const bar = root.querySelector('.selbar');
    if (!bar) return;
    bar.querySelector('#selN').textContent = selIds.size
      ? selIds.size + ' sélectionnée' + (selIds.size > 1 ? 's' : '') : 'Coche des pistes';
    bar.querySelector('#selDel').disabled = !selIds.size;
  };
  const toggleSel = id => {
    selIds.has(id) ? selIds.delete(id) : selIds.add(id);
    root.querySelectorAll(`[data-id="${id}"]`).forEach(el => {
      el.classList.toggle('on', selIds.has(id));
      el.setAttribute('aria-pressed', selIds.has(id));
    });
    syncBar();
  };

  /* le corps se re-rend seul pendant la frappe — le champ de recherche
     reste le même nœud, le curseur ne saute plus */
  const renderBody = () => {
    const body = root.querySelector('#piBody');
    const all = filterCompanies(S.companies, { q, sort, userPos });
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
    if (selMode){
      html +=
        `<div class="selbar">
           <span id="selN"></span>
           <button class="btn btn-sm" id="selQuit">Annuler</button>
           <button class="btn btn-sm btn-danger" id="selDel">${ic('trash', 'ic-14')} Supprimer</button>
         </div>`;
    }
    body.innerHTML = html;

    body.querySelectorAll('.row-item').forEach(r => {
      r.addEventListener('click', () => openById(r.dataset.id));
      r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openById(r.dataset.id); } });
    });
    body.querySelectorAll('.bcard').forEach(b =>
      b.addEventListener('click', () => openById(b.dataset.id)));
    /* appui long sur une ligne/carte = entrer en sélection, elle cochée */
    if (!selMode){
      body.querySelectorAll('.row-item, .bcard').forEach(el => {
        let t = null;
        const cancel = () => { clearTimeout(t); t = null; };
        el.addEventListener('touchstart', () => {
          t = setTimeout(() => {
            longPressAt = Date.now();
            selMode = true;
            selIds.add(el.dataset.id);
            renderPistes();
          }, 500);
        }, { passive: true });
        el.addEventListener('touchmove', cancel, { passive: true });
        el.addEventListener('touchend', cancel);
      });
    }
    body.querySelector('#selQuit')?.addEventListener('click', () => { exitSel(); renderPistes(); });
    body.querySelector('#selDel')?.addEventListener('click', deleteSelected);
    syncBar();
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
  root.querySelector('#piSort').addEventListener('click', openSortSheet);
  root.querySelector('#piSel')?.addEventListener('click', () => {
    selMode ? exitSel() : (selMode = true);
    renderPistes();
  });
  root.querySelector('#piProspect')?.addEventListener('click', openProspect);
  renderBody();
}
