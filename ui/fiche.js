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
import { STATUSES, CLOSE_REASONS, DOMAINS, POSITIONS, pushHist, summarizeChanges,
         nextActionContact } from '../engine/model.js';
import { scoreOf } from '../engine/score.js';
import { bus, isClosed, saveData, reopenPiste, logJ, activateContact } from './state.js';
import { openSheet, openPanel, confirmSheet, toast, btn, ic } from './dom.js';
import { frDate, relLabel } from './dates.js';
import { askNextAction, askClose } from './actions.js';
import { openMail } from './mail.js';
import { openEditPiste } from './edit.js';
import { openContactEditor, telHref, smsHref, waHref } from './contact.js';

const webHref = w => /^https?:\/\//i.test(w) ? w : 'https://' + w;
const webLabel = w => w.replace(/^https?:\/\//i, '').replace(/\/$/, '');

const FORM_FIELDS = ['status', 'nextAction', 'nextActionText', 'nextActionCt', 'notes'];

export function openFiche(c){
  /* le tampon : seulement les champs touchés — rien ne s'écrit avant Confirmer */
  const draft = {};
  const val = f => (f in draft) ? draft[f] : c[f];
  const dirty = () => FORM_FIELDS.some(f => f in draft && draft[f] !== c[f]);
  const touch = (f, v) => {
    if (v === c[f]) delete draft[f];
    else draft[f] = v;
  };

  /* desktop : la fiche vit dans le panneau latéral, la liste reste (#10) */
  const wide = matchMedia('(min-width:901px)').matches;
  const sh = (wide ? openPanel : openSheet)({
    title: c.name, icon: 'briefcase', className: 'modal-fiche',
    guard: () => !dirty() || confirmSheet({
      title: 'Quitter sans enregistrer ?', icon: 'square-alert', danger: true,
      okLabel: 'Quitter', cancelLabel: 'Rester',
      msg: 'Tes changements ne sont pas enregistrés.'
    })
  });
  if (!sh) return null;   /* un panneau retient encore son garde-fou */

  const confirm = () => {
    const before = { status: c.status, notes: c.notes, nextAction: c.nextAction, nextActionText: c.nextActionText };
    for (const f of Object.keys(draft)){
      if (f === 'nextActionCt' && !draft[f]) delete c[f];   /* champ optionnel (#14) */
      else c[f] = draft[f];
    }
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
      ['status', 'nextAction', 'nextActionText', 'nextActionCt'].forEach(f => delete draft[f]);
      render();
    } }), 'archive'));
    /* « Écrire » part vers la personne visée par l'action, sinon la
       première personne joignable (#14) — jamais un email deviné en silence */
    const writeTo = () => {
      const p = nextActionContact(c);
      if (p && p.email) return p.id;
      const withMail = (c.contacts || []).filter(t => t.email);
      const pref = withMail.find(t => t.activatedAt || t.src !== 'promo') || withMail[0];
      return pref && pref.id;
    };
    foot.append(btn('Écrire', d ? '' : 'btn-primary', () => openMail(c, { ctId: writeTo() }), 'mail'));
    if (d) foot.append(btn('Confirmer', 'btn-primary', confirm, 'check'));
  };

  /* une ligne par personne, dépliable — actifs en haut, reçus dormants
     repliés « + N personnes connues » (#14/#15) : plus de mur */
  const ctRowHTML = t => {
    const title = t.name || t.email || t.phone;
    const meta = [t.email, t.phone].filter(x => x && x !== title).join(' · ');
    const subBits = [
      t.role ? esc(t.role) : '',
      (t.src === 'promo' && !t.activatedAt) ? 'reçu de la promo' : '',
      t.conf === 'ok' ? '<span class="conf-ok">vérifié ✓</span>'
        : t.conf === 'doubt' ? '<span class="conf-doubt">à confirmer ?</span>' : ''
    ].filter(Boolean).join(' · ');
    const acts = [
      t.email ? `<button class="btn" data-write="${t.id}">${ic('mail', 'ic-14')} Écrire</button>` : '',
      t.phone ? `<a class="btn" data-act="${t.id}" href="${esc(telHref(t.phone))}">${ic('phone', 'ic-14')} Appeler</a>
                 <a class="btn" data-act="${t.id}" href="${esc(smsHref(t.phone))}">${ic('message-text', 'ic-14')} SMS</a>
                 <a class="btn" data-act="${t.id}" href="${esc(waHref(t.phone))}" target="_blank" rel="noopener">${ic('message-text', 'ic-14')} WhatsApp</a>` : '',
      t.link ? `<a class="btn" data-act="${t.id}" href="${esc(t.link)}" target="_blank" rel="noopener">${ic('external-link', 'ic-14')} Profil</a>` : ''
    ].filter(Boolean).join('');
    return (
      `<details class="ctc">
         <summary><b>${esc(title)}</b>${subBits ? `<span class="ctc-sub">${subBits}</span>` : ''}</summary>
         <div class="ctc-body">
           ${meta ? `<div class="ct-meta">${esc(meta)}</div>` : ''}
           ${acts ? `<div class="ct-acts">${acts}</div>` : ''}
           ${t.note ? `<div class="ct-note">${esc(t.note)}</div>` : ''}
           <button class="linklike" data-ct="${t.id}">${ic('pencil', 'ic-14')} Modifier</button>
         </div>
       </details>`);
  };

  const render = () => {
    const closed = isClosed(c);
    const dirs = directionsUrl(c);
    const score = scoreOf(c);
    const subBits = [c.city, c.domain !== 'autre' ? (DOMAINS[c.domain] || DOMAINS.autre).label : ''].filter(Boolean);
    const know = c.desc || c.website || c.techs || (c.positions || []).length || c.process || c.tips || c.address || dirs;
    const cts = c.contacts || [];
    const main = cts.filter(t => t.activatedAt || t.src !== 'promo')
      .sort((a, b) => String(b.activatedAt || '').localeCompare(String(a.activatedAt || '')));
    const knownCts = cts.filter(t => !t.activatedAt && t.src === 'promo');
    const naCtId = val('nextActionCt');
    const naPerson = !closed && val('nextAction') && naCtId
      ? (c.contacts || []).find(t => t.id === naCtId) : null;
    sh.setTitle(c.name);
    sh.body.innerHTML =
      `${subBits.length ? `<div class="fi-sub">${subBits.map(esc).join(' · ')}</div>` : ''}
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
                    <span>${frDate(val('nextAction'))} · ${relLabel(val('nextAction'))}${naPerson ? ' · ' + esc(naPerson.name || naPerson.email) : ''}</span></div>
                  <button class="btn btn-sm" id="fiNa">Modifier</button>`
               : `<div class="na-cur na-none">Aucune — planifie la suite</div>
                  <button class="btn btn-sm" id="fiNa">Planifier</button>`}
           </div>
         </div>`}
       <div class="field">
         <div class="lbl-row"><label>Contacts</label>
           <button class="btn btn-sm" id="fiCtAdd">${ic('plus', 'ic-14')} Ajouter</button></div>
         ${main.length || knownCts.length ? `
           ${main.length ? `<div class="ctc-list">${main.map(ctRowHTML).join('')}</div>` : ''}
           ${knownCts.length ? `
             <details class="ctc-known"${main.length ? '' : ' open'}>
               <summary>+ ${knownCts.length} personne${knownCts.length > 1 ? 's' : ''} connue${knownCts.length > 1 ? 's' : ''}</summary>
               <div class="ctc-list">${knownCts.map(ctRowHTML).join('')}</div>
             </details>` : ''}`
         : '<p class="hint" style="margin:0">Personne pour l’instant — ajoute au moins un email.</p>'}
       </div>
       ${know ? `
         <details class="fi-hist" id="fiKnow"><summary>À savoir</summary>
           <div class="fi-know">
             ${c.desc ? `<div class="fk"><span class="fk-l">En bref</span><span class="fk-v">${esc(c.desc)}</span></div>` : ''}
             ${c.website ? `<div class="fk"><span class="fk-l">Site</span>
                <a class="fk-v" href="${esc(webHref(c.website))}" target="_blank" rel="noopener">${esc(webLabel(c.website))} ${ic('external-link', 'ic-14')}</a></div>` : ''}
             ${c.techs ? `<div class="fk"><span class="fk-l">Technos</span><span class="fk-v">${esc(c.techs)}</span></div>` : ''}
             ${(c.positions || []).length ? `<div class="fk"><span class="fk-l">Postes</span>
                <span class="fk-v fk-tags">${c.positions.map(p => `<span class="fk-tag">${POSITIONS[p]}</span>`).join('')}</span></div>` : ''}
             ${c.process ? `<div class="fk"><span class="fk-l">Process</span><span class="fk-v">${esc(c.process)}</span></div>` : ''}
             ${c.tips ? `<div class="fk"><span class="fk-l">Conseils</span><span class="fk-v">${esc(c.tips)}</span></div>` : ''}
             ${(c.address || dirs) ? `
               <div class="fi-row">${ic('map-pin', 'ic-14')} <span>${esc(c.address || c.city)}</span>
                 ${dirs ? `<a class="btn btn-sm" href="${esc(dirs)}" target="_blank" rel="noopener">${ic('directions', 'ic-14')} Itinéraire</a>` : ''}
               </div>` : ''}
           </div>
         </details>` : ''}
       <div class="fi-tools">
         <span class="fi-score${score < 50 ? ' low' : ''}">fiche complète à ${score} %</span>
         <button class="btn btn-sm" id="fiEdit">${ic('pencil', 'ic-14')} ${score < 60 ? 'Compléter' : 'Modifier'}</button>
       </div>
       <div class="field"><label for="fiNotes">Mes notes ${ic('lock', 'ic-14')} <span class="lbl-soft">privées</span></label>
         <textarea id="fiNotes" placeholder="Échange avec M. X le 12/03, rappeler la semaine prochaine…">${esc(val('notes'))}</textarea></div>
       ${(c.history || []).length ? `
         <details class="fi-hist"><summary>Historique</summary>
           <ul class="timeline">${c.history.slice().reverse().slice(0, 10).map(h =>
             `<li><span class="d">${esc(fmtDate(h.d))}</span><span>${esc(h.t)}</span></li>`).join('')}</ul>
         </details>` : ''}`;

    /* branchements */
    const byCt = id => (c.contacts || []).find(t => t.id === id);
    sh.body.querySelector('#fiEdit').addEventListener('click', () => openEditPiste(c, render));
    sh.body.querySelector('#fiCtAdd').addEventListener('click', () =>
      openContactEditor({ company: c, onDone: render }));
    sh.body.querySelectorAll('[data-ct]').forEach(b =>
      b.addEventListener('click', () =>
        openContactEditor({ company: c, contact: byCt(b.dataset.ct), onDone: render })));
    /* écrire À cette personne — et tout geste vers elle l'active (#14) */
    sh.body.querySelectorAll('[data-write]').forEach(b =>
      b.addEventListener('click', () => openMail(c, { ctId: b.dataset.write })));
    sh.body.querySelectorAll('[data-act]').forEach(a =>
      a.addEventListener('click', () => {
        const t = byCt(a.dataset.act);
        if (t){ activateContact(c, t); }
      }));
    sh.body.querySelectorAll('.seg').forEach(b =>
      b.addEventListener('click', () => { touch('status', b.dataset.st); render(); }));
    const na = sh.body.querySelector('#fiNa');
    if (na) na.addEventListener('click', () => askNextAction(c, {
      preset: val('nextActionText'),
      presetDate: val('nextAction'),
      /* replanifier à la main = action au niveau entreprise : la personne
         éventuellement visée avant ne colle plus forcément au nouveau verbe */
      onPick: (txt, iso) => { touch('nextActionText', txt); touch('nextAction', iso); touch('nextActionCt', ''); },
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
