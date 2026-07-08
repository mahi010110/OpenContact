/* ============================================================
   OpenContact — interface · fiche piste (version quotidienne)
   Ce qu'il faut pour agir : statut 3 crans, prochaine action,
   contacts joignables en un tap, notes privées, clôture/réouverture,
   itinéraire. L'édition complète des champs partagés arrive avec
   l'écran « Mes pistes » (étape 2).
   ============================================================ */
import { esc, fmtDate, isLate, debounce, directionsUrl } from '../engine/utils.js';
import { STATUSES, CLOSE_REASONS, DOMAINS } from '../engine/model.js';
import { bus, isClosed, setStatus, saveData, reopenPiste } from './state.js';
import { openSheet, toast, btn, ic } from './dom.js';
import { frDate, relLabel } from './dates.js';
import { askNextAction, askClose } from './actions.js';
import { openMail } from './mail.js';

export function openFiche(c){
  const sh = openSheet({ title: c.name, icon: 'briefcase', className: 'modal-fiche' });
  const render = () => {
    const closed = isClosed(c);
    const dirs = directionsUrl(c);
    const subBits = [c.city, c.domain !== 'autre' ? (DOMAINS[c.domain] || DOMAINS.autre).label : ''].filter(Boolean);
    sh.body.innerHTML =
      `${subBits.length ? `<div class="fi-sub">${subBits.map(esc).join(' · ')}</div>` : ''}
       ${c.desc ? `<p class="fi-desc">${esc(c.desc)}</p>` : ''}
       ${closed ? `
         <div class="fi-closed" style="--c:${CLOSE_REASONS[c.closedReason].color}">
           ${ic('archive', 'ic-14')} Clôturée — <b>${CLOSE_REASONS[c.closedReason].label}</b>${c.closedAt ? ' · ' + esc(fmtDate(c.closedAt)) : ''}
           <button class="btn btn-sm" id="fiReopen">Rouvrir</button>
         </div>` : `
         <div class="field"><label>Où j’en suis</label>
           <div class="seg3" role="radiogroup" aria-label="Statut">
             ${Object.keys(STATUSES).map(k =>
               `<button class="seg${c.status === k ? ' on' : ''}" data-st="${k}" aria-pressed="${c.status === k}">${STATUSES[k].label}</button>`).join('')}
           </div>
         </div>
         <div class="field"><label>Prochaine action</label>
           <div class="na-box${c.nextAction && isLate(c.nextAction) ? ' late' : ''}">
             ${c.nextAction
               ? `<div class="na-cur"><b>${esc(c.nextActionText || 'Faire le point')}</b>
                    <span>${frDate(c.nextAction)} · ${relLabel(c.nextAction)}</span></div>
                  <button class="btn btn-sm" id="fiNa">Modifier</button>`
               : `<div class="na-cur na-none">Aucune — c’est elle qui fait vivre « Aujourd’hui »</div>
                  <button class="btn btn-sm btn-primary" id="fiNa">Planifier</button>`}
           </div>
         </div>`}
       ${(c.contacts || []).length ? `
         <div class="field"><label>Contacts</label>
           <div class="ct-list">${c.contacts.map(t => `
             <div class="ct">
               <div class="ct-h"><b>${esc(t.name || t.email || t.phone)}</b>
                 ${t.role ? `<span class="ct-role">${esc(t.role)}</span>` : ''}
                 ${t.conf === 'ok' ? '<span class="conf-ok">vérifié ✓</span>' : t.conf === 'doubt' ? '<span class="conf-doubt">à confirmer ?</span>' : ''}</div>
               <div class="ct-links">
                 ${t.email ? `<a href="mailto:${esc(t.email)}">${ic('mail', 'ic-14')} ${esc(t.email)}</a>` : ''}
                 ${t.phone ? `<a href="tel:${esc(t.phone.replace(/\s/g, ''))}">${ic('phone', 'ic-14')} ${esc(t.phone)}</a>` : ''}
                 ${t.link ? `<a href="${esc(t.link)}" target="_blank" rel="noopener">${ic('link', 'ic-14')} profil</a>` : ''}
               </div>
               ${t.note ? `<div class="ct-note">${esc(t.note)}</div>` : ''}
             </div>`).join('')}</div>
         </div>` : ''}
       ${(c.address || dirs) ? `
         <div class="fi-row">${ic('map-pin', 'ic-14')} <span>${esc(c.address || c.city)}</span>
           ${dirs ? `<a class="btn btn-sm" href="${esc(dirs)}" target="_blank" rel="noopener">${ic('directions', 'ic-14')} Itinéraire</a>` : ''}
         </div>` : ''}
       <div class="field"><label for="fiNotes">Mes notes ${ic('lock', 'ic-14')} <span class="lbl-soft">privées, jamais partagées</span></label>
         <textarea id="fiNotes" placeholder="Échange avec M. X le 12/03, rappeler la semaine prochaine…">${esc(c.notes)}</textarea></div>
       ${(c.history || []).length ? `
         <details class="fi-hist"><summary>Historique</summary>
           <ul class="timeline">${c.history.slice().reverse().slice(0, 10).map(h =>
             `<li><span class="d">${esc(fmtDate(h.d))}</span><span>${esc(h.t)}</span></li>`).join('')}</ul>
         </details>` : ''}`;

    /* branchements */
    sh.body.querySelectorAll('.seg').forEach(b =>
      b.addEventListener('click', () => { setStatus(c, b.dataset.st); render(); bus.refresh(); }));
    const na = sh.body.querySelector('#fiNa');
    if (na) na.addEventListener('click', () => askNextAction(c, { onDone: render }));
    const ro = sh.body.querySelector('#fiReopen');
    if (ro) ro.addEventListener('click', () => { reopenPiste(c); render(); bus.refresh(); toast('Piste rouverte.'); });
    sh.body.querySelector('#fiNotes').addEventListener('input', debounce(e => {
      c.notes = e.target.value;
      c.updatedAt = Date.now();
      saveData();
    }, 500));

    const foot = sh.ov.querySelector('.modal-f');
    foot.innerHTML = '';
    foot.hidden = false;
    if (!closed){
      foot.append(
        btn('Clôturer', 'btn-ghost', () => askClose(c, { onDone: render }), 'archive'),
        btn('Écrire', 'btn-primary', () => openMail(c), 'mail')
      );
    } else {
      foot.append(btn('Écrire', 'btn-primary', () => openMail(c), 'mail'));
    }
  };
  render();
  return sh;
}
