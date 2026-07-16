/* ============================================================
   OpenContact — interface · fiche piste (version quotidienne)
   Un FORMULAIRE : statut, prochaine action et notes s'accumulent
   dans un tampon et ne s'écrivent qu'au « Confirmer » — une seule
   entrée d'historique, le résumé de ce qui a réellement changé.
   Consulter n'écrit jamais rien ; quitter avec des modifs =
   léger garde-fou. Contacts joignables en un tap, clôture,
   itinéraire — l'édition des champs partagés reste sa feuille.
   ============================================================ */
import { esc, fmtDate, isLate, directionsUrl } from '../engine/utils.js';
import { STATUSES, CLOSE_REASONS, DOMAINS, POSITIONS, pushHist, summarizeChanges } from '../engine/model.js';
import { scoreOf } from '../engine/score.js';
import { bus, isClosed, saveData, reopenPiste, logJ } from './state.js';
import { openSheet, confirmSheet, toast, btn, ic } from './dom.js';
import { frDate, relLabel } from './dates.js';
import { askNextAction, askClose } from './actions.js';
import { openMail } from './mail.js';
import { openEditPiste } from './edit.js';
import { openContactEditor, telHref, smsHref, waHref } from './contact.js';

const webHref = w => /^https?:\/\//i.test(w) ? w : 'https://' + w;
const webLabel = w => w.replace(/^https?:\/\//i, '').replace(/\/$/, '');

const FORM_FIELDS = ['status', 'nextAction', 'nextActionText', 'notes'];

export function openFiche(c){
  /* le tampon : seulement les champs touchés — rien ne s'écrit avant Confirmer */
  const draft = {};
  const val = f => (f in draft) ? draft[f] : c[f];
  const dirty = () => FORM_FIELDS.some(f => f in draft && draft[f] !== c[f]);
  const touch = (f, v) => {
    if (v === c[f]) delete draft[f];
    else draft[f] = v;
  };

  const sh = openSheet({
    title: c.name, icon: 'briefcase', className: 'modal-fiche',
    guard: () => !dirty() || confirmSheet({
      title: 'Quitter sans enregistrer ?', icon: 'square-alert', danger: true,
      okLabel: 'Quitter', cancelLabel: 'Rester',
      msg: 'Tes changements ne sont pas enregistrés.'
    })
  });

  const confirm = () => {
    const before = { status: c.status, notes: c.notes, nextAction: c.nextAction, nextActionText: c.nextActionText };
    for (const f of Object.keys(draft)) c[f] = draft[f];
    for (const f of Object.keys(draft)) delete draft[f];
    const sum = summarizeChanges(before, c);
    if (sum){
      pushHist(c, sum);
      logJ(c.name + ' — ' + sum, c.id);
      c.updatedAt = Date.now();
      saveData();
      toast('Enregistré ✓');
    }
    bus.refresh();
    render();
  };

  const renderFoot = () => {
    const foot = sh.ov.querySelector('.modal-f');
    foot.innerHTML = '';
    foot.hidden = false;
    const d = dirty();
    if (!isClosed(c)) foot.append(btn('Clôturer', 'btn-ghost', () => askClose(c, { onDone: () => {
      ['status', 'nextAction', 'nextActionText'].forEach(f => delete draft[f]);
      render();
    } }), 'archive'));
    foot.append(btn('Écrire', d ? '' : 'btn-primary', () => openMail(c), 'mail'));
    if (d) foot.append(btn('Confirmer', 'btn-primary', confirm, 'check'));
  };

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
               `<button class="seg${val('status') === k ? ' on' : ''}" data-st="${k}" aria-pressed="${val('status') === k}">${STATUSES[k].label}</button>`).join('')}
           </div>
         </div>
         <div class="field"><label>Prochaine action</label>
           <div class="na-box${val('nextAction') && isLate(val('nextAction')) ? ' late' : ''}">
             ${val('nextAction')
               ? `<div class="na-cur"><b>${esc(val('nextActionText') || 'Faire le point')}</b>
                    <span>${frDate(val('nextAction'))} · ${relLabel(val('nextAction'))}</span></div>
                  <button class="btn btn-sm" id="fiNa">Modifier</button>`
               : `<div class="na-cur na-none">Aucune — planifie la suite</div>
                  <button class="btn btn-sm" id="fiNa">Planifier</button>`}
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
         <textarea id="fiNotes" placeholder="Échange avec M. X le 12/03, rappeler la semaine prochaine…">${esc(val('notes'))}</textarea></div>
       ${(c.history || []).length ? `
         <details class="fi-hist"><summary>Historique</summary>
           <ul class="timeline">${c.history.slice().reverse().slice(0, 10).map(h =>
             `<li><span class="d">${esc(fmtDate(h.d))}</span><span>${esc(h.t)}</span></li>`).join('')}</ul>
         </details>` : ''}`;

    /* branchements */
    sh.body.querySelector('#fiEdit').addEventListener('click', () => openEditPiste(c, render));
    sh.body.querySelector('#fiCtAdd').addEventListener('click', () =>
      openContactEditor({ company: c, onDone: render }));
    sh.body.querySelectorAll('[data-ct]').forEach(b =>
      b.addEventListener('click', () =>
        openContactEditor({ company: c, contact: c.contacts.find(t => t.id === b.dataset.ct), onDone: render })));
    sh.body.querySelectorAll('.seg').forEach(b =>
      b.addEventListener('click', () => { touch('status', b.dataset.st); render(); }));
    const na = sh.body.querySelector('#fiNa');
    if (na) na.addEventListener('click', () => askNextAction(c, {
      preset: val('nextActionText'),
      presetDate: val('nextAction'),
      onPick: (txt, iso) => { touch('nextActionText', txt); touch('nextAction', iso); },
      onDone: render
    }));
    const ro = sh.body.querySelector('#fiReopen');
    if (ro) ro.addEventListener('click', () => { reopenPiste(c); render(); bus.refresh(); toast('Piste rouverte.'); });
    sh.body.querySelector('#fiNotes').addEventListener('input', e => {
      touch('notes', e.target.value);
      renderFoot();
    });
    renderFoot();
  };
  render();
  return sh;
}
