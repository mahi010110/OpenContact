/* ============================================================
   OpenContact — interface · fiche piste (version quotidienne)
   Ce qu'il faut pour agir : statut 3 crans, prochaine action,
   contacts joignables en un tap (appel, SMS, WhatsApp, email),
   notes privées, clôture/réouverture, itinéraire — et l'édition
   complète des champs partagés (feuille « Modifier »).
   ============================================================ */
import { esc, fmtDate, isLate, debounce, directionsUrl } from '../engine/utils.js';
import { STATUSES, CLOSE_REASONS, DOMAINS, POSITIONS } from '../engine/model.js';
import { scoreOf } from '../engine/score.js';
import { bus, isClosed, setStatus, saveData, reopenPiste, deletePiste, undeletePiste } from './state.js';
import { openSheet, confirmSheet, toast, btn, ic, showUndo } from './dom.js';
import { frDate, relLabel } from './dates.js';
import { askNextAction, askClose } from './actions.js';
import { openMail } from './mail.js';
import { openEditPiste } from './edit.js';
import { openContactEditor, telHref, smsHref, waHref } from './contact.js';

const webHref = w => /^https?:\/\//i.test(w) ? w : 'https://' + w;
const webLabel = w => w.replace(/^https?:\/\//i, '').replace(/\/$/, '');

export function openFiche(c){
  const sh = openSheet({ title: c.name, icon: 'briefcase', className: 'modal-fiche' });
  const render = () => {
    const closed = isClosed(c);
    const dirs = directionsUrl(c);
    const score = scoreOf(c);
    const subBits = [c.city, c.domain !== 'autre' ? (DOMAINS[c.domain] || DOMAINS.autre).label : ''].filter(Boolean);
    const know = c.website || c.techs || (c.positions || []).length || c.process || c.tips;
    sh.setTitle(c.name);
    sh.body.innerHTML =
      `${subBits.length ? `<div class="fi-sub">${subBits.map(esc).join(' · ')}</div>` : ''}
       ${c.desc ? `<p class="fi-desc">${esc(c.desc)}</p>` : ''}
       <div class="fi-tools">
         <span class="fi-score${score < 50 ? ' low' : ''}">fiche complète à ${score} %</span>
         <button class="btn btn-sm" id="fiEdit">${ic('pencil', 'ic-14')} ${score < 60 ? 'Compléter' : 'Modifier'}</button>
       </div>
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
               : `<div class="na-cur na-none">Aucune — planifie la suite</div>
                  <button class="btn btn-sm btn-primary" id="fiNa">Planifier</button>`}
           </div>
         </div>`}
       <div class="field">
         <div class="lbl-row"><label>Contacts</label>
           <button class="btn btn-sm" id="fiCtAdd">${ic('plus', 'ic-14')} Ajouter</button></div>
         ${(c.contacts || []).length ? `
         <div class="ct-list">${c.contacts.map(t => {
           const title = t.name || t.email || t.phone;
           const meta = [t.email, t.phone].filter(x => x && x !== title).join(' · ');
           const acts = [
             t.email ? `<a class="btn" href="mailto:${esc(t.email)}">${ic('mail', 'ic-14')} Email</a>` : '',
             t.phone ? `<a class="btn" href="${esc(telHref(t.phone))}">${ic('phone', 'ic-14')} Appeler</a>
                        <a class="btn" href="${esc(smsHref(t.phone))}">${ic('message-text', 'ic-14')} SMS</a>
                        <a class="btn" href="${esc(waHref(t.phone))}" target="_blank" rel="noopener">${ic('message-text', 'ic-14')} WhatsApp</a>` : '',
             t.link ? `<a class="btn" href="${esc(t.link)}" target="_blank" rel="noopener">${ic('external-link', 'ic-14')} Profil</a>` : ''
           ].filter(Boolean).join('');
           return `
           <div class="ct">
             <div class="ct-h"><b>${esc(title)}</b>
               ${t.role ? `<span class="ct-role">${esc(t.role)}</span>` : ''}
               ${t.conf === 'ok' ? '<span class="conf-ok">vérifié ✓</span>' : t.conf === 'doubt' ? '<span class="conf-doubt">à confirmer ?</span>' : ''}
               <button class="abtn abtn-sm" data-ct="${t.id}" aria-label="Modifier ${esc(t.name || 'le contact')}" title="Modifier">${ic('pencil', 'ic-14')}</button></div>
             ${meta ? `<div class="ct-meta">${esc(meta)}</div>` : ''}
             ${acts ? `<div class="ct-acts">${acts}</div>` : ''}
             ${t.note ? `<div class="ct-note">${esc(t.note)}</div>` : ''}
           </div>`;
         }).join('')}</div>` :
         '<p class="hint" style="margin:0">Personne pour l’instant — ajoute au moins un email.</p>'}
       </div>
       ${know ? `
         <div class="field"><label>À savoir</label>
           <div class="fi-know">
             ${c.website ? `<div class="fk"><span class="fk-l">Site</span>
                <a class="fk-v" href="${esc(webHref(c.website))}" target="_blank" rel="noopener">${esc(webLabel(c.website))} ${ic('external-link', 'ic-14')}</a></div>` : ''}
             ${c.techs ? `<div class="fk"><span class="fk-l">Technos</span><span class="fk-v">${esc(c.techs)}</span></div>` : ''}
             ${(c.positions || []).length ? `<div class="fk"><span class="fk-l">Postes</span>
                <span class="fk-v fk-tags">${c.positions.map(p => `<span class="fk-tag">${POSITIONS[p]}</span>`).join('')}</span></div>` : ''}
             ${c.process ? `<div class="fk"><span class="fk-l">Process</span><span class="fk-v">${esc(c.process)}</span></div>` : ''}
             ${c.tips ? `<div class="fk"><span class="fk-l">Conseils</span><span class="fk-v">${esc(c.tips)}</span></div>` : ''}
           </div>
         </div>` : ''}
       ${(c.address || dirs) ? `
         <div class="fi-row">${ic('map-pin', 'ic-14')} <span>${esc(c.address || c.city)}</span>
           ${dirs ? `<a class="btn btn-sm" href="${esc(dirs)}" target="_blank" rel="noopener">${ic('directions', 'ic-14')} Itinéraire</a>` : ''}
         </div>` : ''}
       <div class="field"><label for="fiNotes">Mes notes ${ic('lock', 'ic-14')} <span class="lbl-soft">privées</span></label>
         <textarea id="fiNotes" placeholder="Échange avec M. X le 12/03, rappeler la semaine prochaine…">${esc(c.notes)}</textarea></div>
       ${(c.history || []).length ? `
         <details class="fi-hist"><summary>Historique</summary>
           <ul class="timeline">${c.history.slice().reverse().slice(0, 10).map(h =>
             `<li><span class="d">${esc(fmtDate(h.d))}</span><span>${esc(h.t)}</span></li>`).join('')}</ul>
         </details>` : ''}
       <button class="linklike fi-del" id="fiDel">${ic('trash', 'ic-14')} Supprimer la piste</button>`;

    /* branchements */
    sh.body.querySelector('#fiEdit').addEventListener('click', () => openEditPiste(c, render));
    sh.body.querySelector('#fiCtAdd').addEventListener('click', () =>
      openContactEditor({ company: c, onDone: render }));
    sh.body.querySelectorAll('[data-ct]').forEach(b =>
      b.addEventListener('click', () =>
        openContactEditor({ company: c, contact: c.contacts.find(t => t.id === b.dataset.ct), onDone: render })));
    sh.body.querySelectorAll('.seg').forEach(b =>
      b.addEventListener('click', () => { setStatus(c, b.dataset.st); render(); bus.refresh(); }));
    const na = sh.body.querySelector('#fiNa');
    if (na) na.addEventListener('click', () => askNextAction(c, { onDone: render }));
    const ro = sh.body.querySelector('#fiReopen');
    if (ro) ro.addEventListener('click', () => { reopenPiste(c); render(); bus.refresh(); toast('Piste rouverte.'); });
    sh.body.querySelector('#fiDel').addEventListener('click', async () => {
      const ok = await confirmSheet({
        title: 'Supprimer cette piste ?', danger: true, okLabel: 'Supprimer', icon: 'trash',
        msg: `<b>${esc(c.name)}</b> sera supprimée — aussi de tes appareils synchronisés.`
      });
      if (!ok) return;
      deletePiste(c);
      sh.close();
      bus.refresh();
      showUndo(`${ic('check', 'ic-14')} « ${esc(c.name)} » supprimée.`, () => {
        undeletePiste(c);
        bus.refresh();
        toast('Piste restaurée.');
      });
    });
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
