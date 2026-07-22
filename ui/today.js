/* ============================================================
   OpenContact — interface · « Aujourd'hui »
   Le flux d'actions : En retard · Aujourd'hui · Bientôt (repliée).
   Une ligne = une action — Écrire / Reporter / Fait (swipe sur
   mobile). Faire une action vide la ligne. État vide positif,
   jamais culpabilisant. Jamais 40 lignes d'un coup.
   ============================================================ */
import { esc, todayISO } from '../engine/utils.js';
import { dueFollowups } from '../engine/assist.js';
import { S, bus, isClosed, markDone, hasDemo, addDemo, removeDemo } from './state.js';
import { $, ic, toast, openSheet } from './dom.js';
import { frToday, frDate, relLabel } from './dates.js';
import { askNextAction, reportAction } from './actions.js';
import { openMail } from './mail.js';
import { openFiche } from './fiche.js';
import { openCapture } from './capture.js';
import { campaignLines, openCampaignById } from './campagnes.js';
import { mailAnalysis } from './analyse.js';
import { openPendingMailAnalysis } from './recevoir.js';
import { pendingProposals, openPendingProposals } from './propositions.js';

const CAP = 8;                      /* lignes visibles par tranche avant « voir plus » */
const expanded = new Set();         /* tranches dépliées à la main (le temps de la session) */

function doneTodayCount(){
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return S.journal.filter(e => e.t >= +start &&
    (e.txt.startsWith('Fait :') || e.txt.startsWith('Email envoyé') || e.txt.startsWith('Clôturée'))).length;
}
/* pistes arrivées par partage aujourd'hui — le petit accès « reçu de la promo » */
function receivedTodayCount(){
  const today = todayISO();
  return S.companies.filter(c =>
    (c.history || []).some(h => h.t === 'Reçue via partage' && h.d === today)).length;
}

function rowHTML(c){
  const verb = c.nextActionText || 'Faire le point';
  const today = todayISO();
  /* la tranche donne le contexte : en retard → seul l'écart compte,
     aujourd'hui → rien à répéter, bientôt → la date. L'échéance passe
     devant le nom : c'est lui qui se tronque, jamais elle. */
  const when = c.nextAction < today ? `<em class="late">${relLabel(c.nextAction)}</em> · `
             : c.nextAction > today ? frDate(c.nextAction) + ' · ' : '';
  return (
    `<div class="act-row" data-id="${c.id}">
       <div class="act-under act-under-done">${ic('check', 'ic-14')} Fait</div>
       <div class="act-under act-under-report">${ic('clock', 'ic-14')} Reporter</div>
       <div class="act-in">
         <div class="act-main" role="button" tabindex="0" aria-label="Ouvrir ${esc(c.name)}">
           <b class="act-verb">${esc(verb)}</b>
           <span class="act-sub">${when}${esc(c.name)}</span>
         </div>
         <div class="act-btns">
           <button class="abtn" data-a="mail" aria-label="Écrire à ${esc(c.name)}" title="Écrire">${ic('mail')}</button>
           <button class="abtn" data-a="report" aria-label="Reporter" title="Reporter">${ic('clock')}</button>
           <button class="abtn abtn-ok" data-a="done" aria-label="Fait" title="Fait">${ic('check')}</button>
         </div>
       </div>
     </div>`);
}
function trancheHTML(key, label, icon, items, open){
  if (!items.length) return '';
  const cap = expanded.has(key) ? items.length : CAP;
  const rows = items.slice(0, cap).map(rowHTML).join('');
  const more = items.length > cap
    ? `<button class="linklike tr-more" data-tr="${key}">Voir les ${items.length - cap} autres</button>` : '';
  const head = `${ic(icon, 'ic-14')} ${label} <span class="tr-n">${items.length}</span>`;
  if (key === 'soon'){
    return `<details class="tranche tr-${key}"${open ? ' open' : ''}>
              <summary class="tr-h">${head}</summary><div class="tr-rows">${rows}${more}</div>
            </details>`;
  }
  return `<section class="tranche tr-${key}">
            <h3 class="tr-h">${head}</h3><div class="tr-rows">${rows}${more}</div>
          </section>`;
}

/* les entrants à trier — une seule ligne calme (#10), plus jamais une
   pile de bandeaux au-dessus du travail du jour */
function triageItems(){
  const items = [];
  if (S.orphans.length) items.push({
    n: S.orphans.length, icon: 'contact', label: 'Contacts à rattacher',
    open: () => { location.hash = '#/pistes'; } });
  const recv = receivedTodayCount();
  if (recv) items.push({
    n: recv, icon: 'inbox', label: 'Reçu de la promo',
    open: () => { location.hash = '#/pistes'; } });
  const analysis = mailAnalysis();
  if (analysis && analysis.state === 'ready') items.push({
    n: analysis.count, icon: 'sparkles', label: 'Pistes lues dans tes e-mails',
    open: openPendingMailAnalysis });
  const nProps = pendingProposals().reduce((n, p) => n + p.n, 0);
  if (nProps) items.push({
    n: nProps, icon: 'sparkles', label: 'Ton assistant propose',
    open: openPendingProposals });
  return { items, total: items.reduce((s, x) => s + x.n, 0) };
}
function openTriage(items){
  if (items.length === 1){ items[0].open(); return; }
  const sh = openSheet({ title: 'À trier', icon: 'inbox' });
  sh.body.innerHTML =
    `<div class="pick-list">${items.map((x, i) =>
      `<button class="pick" data-i="${i}">
         <b>${ic(x.icon, 'ic-14')} ${esc(x.label)}</b><span>${x.n}</span>
       </button>`).join('')}</div>`;
  sh.body.querySelectorAll('.pick').forEach(b =>
    b.addEventListener('click', () => { sh.close(); items[+b.dataset.i].open(); }));
}

export function renderToday(){
  const root = $('#view-aujourdhui');
  const today = todayISO();
  const alive = S.companies.filter(c => !isClosed(c));
  const byDate = (a, b) => a.nextAction.localeCompare(b.nextAction) || (b.updatedAt || 0) - (a.updatedAt || 0);
  /* « En retard » : priorisation locale (retard, puis pistes déjà
     travaillées — celles qu'il ne faut pas lâcher) */
  const lateOrder = dueFollowups(alive, today).map(x => x.id);
  const late = alive.filter(c => c.nextAction && c.nextAction < today)
    .sort((a, b) => lateOrder.indexOf(a.id) - lateOrder.indexOf(b.id));
  const due = alive.filter(c => c.nextAction === today).sort(byDate);
  const soon = alive.filter(c => c.nextAction && c.nextAction > today).sort(byDate);
  const noAction = alive.filter(c => !c.nextAction);
  const done = doneTodayCount();
  const triage = triageItems();

  let html =
    `<div class="page-inner">
       <div class="td-head">
         <h2>Aujourd’hui</h2>
         <div class="td-date">${frToday()}</div>
       </div>
       ${done ? `<div class="done-line">${ic('check', 'ic-14')} ${done} action${done > 1 ? 's' : ''} faite${done > 1 ? 's' : ''} aujourd’hui</div>` : ''}`;

  if (!alive.length && !S.companies.length){
    /* première visite : la promesse, puis un seul geste */
    html +=
      `<div class="td-empty">
         <div class="tde-ic">${ic('zap', 'ic-24')}</div>
         <h3>Ta recherche, un jour à la fois</h3>
         <p>Ajoute une piste, donne-lui une prochaine action — cet écran te dira toujours quoi faire maintenant.</p>
         <div class="tde-actions">
           <button class="btn btn-primary" id="tdeAdd">${ic('plus', 'ic-14')} Ajouter ma première piste</button>
           <button class="btn" id="tdeDemo">Voir un exemple</button>
         </div>
       </div>`;
  } else if (!late.length && !due.length){
    /* à jour : positif, jamais culpabilisant */
    html +=
      `<div class="td-empty td-clear">
         <div class="tde-ic ok">${ic('check', 'ic-24')}</div>
         <h3>Tout est à jour</h3>
         <p>${soon.length
            ? 'Rien d’urgent — la suite est plus bas, repliée exprès.'
            : noAction.length
              ? 'Rien de planifié. Prends de l’avance en donnant une prochaine action à une piste.'
              : 'Rien à faire — ajoute une piste quand tu en croises une.'}</p>
       </div>`;
  } else {
    html += trancheHTML('late', 'En retard', 'square-alert', late);
    html += trancheHTML('due', 'Aujourd’hui', 'zap', due);
  }
  /* les campagnes du jour — SOUS le travail, jamais tronquées (#10) */
  html += campaignLines().map(l =>
    `<button class="camp-line" data-camp="${esc(l.id)}">${ic('flag', 'ic-14')} <span>${esc(l.txt)}</span> <em>Voir</em></button>`).join('');
  html += trancheHTML('soon', 'Bientôt', 'calendar', soon, false);
  if (triage.total){
    html += `<button class="td-triage" id="tdTriage">${ic('inbox', 'ic-14')} À trier <span class="tr-n">${triage.total}</span></button>`;
  }
  if (noAction.length && alive.length){
    html += `<button class="td-foot linklike" id="tdNoAct">${noAction.length} piste${noAction.length > 1 ? 's' : ''} sans prochaine action →</button>`;
  }
  if (hasDemo()){
    html += `<button class="td-foot linklike" id="tdRmDemo">Retirer les pistes d’exemple</button>`;
  }
  html += '</div>';
  root.innerHTML = html;

  /* branchements */
  const byId = id => S.companies.find(x => x.id === id);
  root.querySelectorAll('.act-row').forEach(row => {
    const c = byId(row.dataset.id);
    if (!c) return;
    row.querySelector('.act-main').addEventListener('click', () => openFiche(c));
    row.querySelector('.act-main').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openFiche(c); }
    });
    row.querySelector('[data-a="mail"]').addEventListener('click', () => openMail(c));
    row.querySelector('[data-a="report"]').addEventListener('click', () => reportAction(c));
    row.querySelector('[data-a="done"]').addEventListener('click', () => finishRow(row, c));
    bindSwipe(row, c);
  });
  root.querySelectorAll('.tr-more').forEach(b =>
    b.addEventListener('click', () => { expanded.add(b.dataset.tr); renderToday(); }));
  const goPistes = () => { location.hash = '#/pistes'; };
  root.querySelectorAll('[data-camp]').forEach(b =>
    b.addEventListener('click', () => openCampaignById(b.dataset.camp)));
  root.querySelector('#tdTriage')?.addEventListener('click', () => openTriage(triage.items));
  root.querySelector('#tdNoAct')?.addEventListener('click', goPistes);
  root.querySelector('#tdeAdd')?.addEventListener('click', () => openCapture());
  root.querySelector('#tdeDemo')?.addEventListener('click', () => { addDemo(); bus.refresh(); toast('Exemple ajouté — retire-le quand tu veux.'); });
  root.querySelector('#tdRmDemo')?.addEventListener('click', () => { removeDemo(); bus.refresh(); toast('Exemple retiré.'); });
}

/* la ligne se vide : petit temps d'effacement, puis la suite */
function finishRow(row, c){
  if (row.classList.contains('act-gone')) return;   /* double-tap = un seul « Fait » */
  row.classList.add('act-gone');
  setTimeout(() => {
    markDone(c);
    bus.refresh();
    askNextAction(c, { title: 'Fait ✓ — et ensuite ?' });
  }, 160);
}

/* swipe mobile : droite = Fait, gauche = Reporter */
function bindSwipe(row, c){
  if (!matchMedia('(pointer:coarse)').matches) return;
  const inner = row.querySelector('.act-in');
  let x0 = null, y0 = null, dx = 0, active = false;
  row.addEventListener('touchstart', e => {
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; active = false;
  }, { passive: true });
  row.addEventListener('touchmove', e => {
    if (x0 == null) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (!active){
      if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my) * 1.4) return;
      active = true;
    }
    dx = Math.max(-96, Math.min(96, mx));
    inner.style.transform = `translateX(${dx}px)`;
    row.classList.toggle('swipe-done', dx > 24);
    row.classList.toggle('swipe-report', dx < -24);
  }, { passive: true });
  row.addEventListener('touchend', () => {
    if (active){
      if (dx > 72){ finishRow(row, c); x0 = null; return; }
      if (dx < -72) reportAction(c);
    }
    inner.style.transform = '';
    row.classList.remove('swipe-done', 'swipe-report');
    x0 = null;
  });
}
