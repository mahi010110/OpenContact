/* ============================================================
   OpenContact — interface · contacts
   L'éditeur (depuis une fiche, ou générique — le contact sans
   entreprise atterrit dans le bac « à rattacher »), la feuille de
   rattachement, et les liens natifs appel / SMS / WhatsApp.
   ============================================================ */
import { esc, uid, todayISO, debounce, normName } from '../engine/utils.js';
import { normalizeCompany, normalizeContact, contactHasData, pushHist, STATUSES } from '../engine/model.js';
import { findMatch } from '../engine/merge.js';
import { S, bus, saveData, saveOrphans, logJ, isClosed,
         addOrphan, removeOrphan, attachContact, ctLabel } from './state.js';
import { openSheet, confirmSheet, toast, btn, ic } from './dom.js';

/* liens natifs vers un numéro (0X XX… français → +33 pour WhatsApp) */
export const telHref = p => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
export const smsHref = p => 'sms:' + String(p || '').replace(/[^\d+]/g, '');
export function waHref(p){
  const raw = String(p || '').trim();
  let d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (!raw.startsWith('+') && d.length === 10 && d[0] === '0') d = '33' + d.slice(1);
  return 'https://wa.me/' + d;
}

/* ---------- éditeur ----------
   o.company : la piste cible (absent = mode générique / orphelin)
   o.contact : contact existant à modifier (dans la piste ou le bac)
   o.prefill : valeurs de départ pour un NOUVEAU contact (ex. : la
   capture qui bascule — l'entreprise déjà tapée suit dans extra.company) */
export function openContactEditor(o){
  o = o || {};
  const c = o.company || null;
  const src = o.contact || o.prefill || {};
  const editing = !!o.contact;
  const inOrphans = editing && !c && S.orphans.some(x => x.id === src.id);
  const done = () => { bus.refresh(); if (o.onDone) o.onDone(); };

  const sh = openSheet({
    title: editing ? ctLabel(src) : (c ? 'Contact — ' + c.name : 'Nouveau contact'),
    icon: 'contact', focus: '#ceName'
  });
  sh.body.innerHTML =
    `<div class="grid2">
       <div class="field"><label for="ceName">Nom</label>
         <input id="ceName" value="${esc(src.name || '')}" placeholder="Ex : Nadia Rahmani" autocomplete="off"></div>
       <div class="field"><label for="ceRole">Rôle</label>
         <input id="ceRole" value="${esc(src.role || '')}" placeholder="Ex : RH, team lead" autocomplete="off"></div>
     </div>
     <div class="grid2">
       <div class="field"><label for="ceEmail">Email</label>
         <input id="ceEmail" type="email" value="${esc(src.email || '')}" autocomplete="off" inputmode="email"></div>
       <div class="field"><label for="cePhone">Téléphone</label>
         <input id="cePhone" type="tel" value="${esc(src.phone || '')}" autocomplete="off" inputmode="tel"></div>
     </div>
     <div class="field"><label for="ceLink">Profil <span class="lbl-soft">— LinkedIn ou autre</span></label>
       <input id="ceLink" type="url" value="${esc(src.link || '')}" placeholder="https://…" autocomplete="off"></div>
     ${!c ? `
     <div class="field"><label for="ceCo">Entreprise <span class="lbl-soft">— si tu la connais</span></label>
       <input id="ceCo" value="${esc((src.extra && src.extra.company) || '')}" placeholder="Ex : OVHcloud" autocomplete="off">
       <p class="hint" id="ceCoNote" hidden></p></div>` : ''}
     <div class="field"><label for="ceNote">Note</label>
       <input id="ceNote" value="${esc(src.note || '')}" placeholder="Ex : rencontré au forum de l’IUT" autocomplete="off"></div>
     <label class="ckline"><input type="checkbox" id="ceConf"${src.conf === 'ok' ? ' checked' : ''}> J’ai vérifié ces coordonnées</label>`;
  const q = s => sh.body.querySelector(s);
  const v = s => q(s).value.trim();

  /* le champ entreprise dit tout de suite où ira le contact */
  const coNote = q('#ceCoNote');
  const coMatch = () => { const n = v('#ceCo'); return n ? findMatch({ name: n }, S.companies) : null; };
  if (coNote){
    const upd = () => {
      const m = coMatch();
      coNote.hidden = !v('#ceCo');
      coNote.textContent = m
        ? '→ ira dans la fiche « ' + m.name + ' »'
        : 'pas encore de piste à ce nom — le contact attendra dans « à rattacher »';
    };
    q('#ceCo').addEventListener('input', debounce(upd, 250));
    upd();
  }

  const foot = [
    btn('Enregistrer', 'btn-primary', () => {
      const data = {
        id: src.id || uid(),
        name: v('#ceName'), role: v('#ceRole'), email: v('#ceEmail'),
        phone: v('#cePhone'), link: v('#ceLink'), note: v('#ceNote'),
        conf: q('#ceConf').checked ? 'ok' : (src.conf === 'doubt' ? 'doubt' : '')
      };
      if (!contactHasData(data)){
        toast('Renseigne au moins un nom, un email ou un téléphone.');
        q('#ceName').focus();
        return;
      }
      if (c){
        if (editing){
          const before = JSON.stringify(src);
          Object.assign(src, data);
          if (JSON.stringify(src) !== before){
            pushHist(c, 'Contact modifié : ' + ctLabel(src));
            c.updatedAt = Date.now();
            saveData();
          }
        } else {
          attachContact(c, data);
        }
        sh.close(); done();
        return;
      }
      /* mode générique : la piste existe → on y range ; sinon → le bac */
      const m = coMatch();
      if (m){
        attachContact(m, data);
        if (inOrphans) removeOrphan(src.id);
        sh.close();
        toast(ctLabel(data) + ' → rangé dans « ' + m.name + ' » ✓');
        done();
        return;
      }
      const coName = q('#ceCo') ? v('#ceCo') : '';
      if (coName) data.company = coName;            /* indice conservé dans extra */
      if (inOrphans){
        const i = S.orphans.findIndex(x => x.id === src.id);
        S.orphans[i] = normalizeContact(data);
        saveOrphans();
        toast('Contact mis à jour.');
      } else {
        addOrphan(data);
        toast('Contact gardé de côté — rattache-le à une piste quand tu sais.');
      }
      sh.close(); done();
    })
  ];
  if (editing) foot.unshift(btn('Retirer', 'btn-ghost btn-danger', async () => {
    const ok = await confirmSheet({
      title: 'Retirer ce contact ?', danger: true, okLabel: 'Retirer',
      msg: '<b>' + esc(ctLabel(src)) + '</b> sera retiré' + (c ? ' de la fiche « ' + esc(c.name) + ' »' : ' du bac « à rattacher »') + '.'
    });
    if (!ok) return;
    if (c){
      c.contacts = (c.contacts || []).filter(t => t.id !== src.id);
      pushHist(c, 'Contact retiré : ' + ctLabel(src));
      c.updatedAt = Date.now();
      saveData();
    } else {
      removeOrphan(src.id);
    }
    sh.close(); done();
  }, 'trash'));
  sh.setFoot(foot);
}

/* ---------- rattacher un orphelin à une piste ---------- */
export function openAttach(ct){
  const sh = openSheet({ title: 'Rattacher — ' + ctLabel(ct), icon: 'building', focus: '#atQ' });
  sh.body.innerHTML =
    `<div class="field"><label for="atQ">Quelle entreprise ?</label>
       <input id="atQ" value="${esc((ct.extra && ct.extra.company) || '')}" placeholder="Cherche ou tape un nom…" autocomplete="off"></div>
     <div class="pick-list" id="atList"></div>`;
  const q = s => sh.body.querySelector(s);

  const attach = c => {
    attachContact(c, ct);
    removeOrphan(ct.id);
    sh.close();
    toast(ctLabel(ct) + ' → « ' + c.name + ' » ✓');
    bus.refresh();
  };
  const renderList = () => {
    const txt = q('#atQ').value.trim();
    const nq = normName(txt);
    const list = S.companies
      .filter(c => !nq || normName(c.name).includes(nq) || normName(c.city).includes(nq))
      .slice(0, 12);
    let html = list.map(c =>
      `<button class="pick" data-id="${c.id}">
         <b>${esc(c.name)}</b>
         <span>${isClosed(c) ? 'clôturée' : STATUSES[c.status].label}${c.city ? ' · ' + esc(c.city) : ''}</span>
       </button>`).join('');
    if (txt && !S.companies.some(c => normName(c.name) === nq)){
      html += `<button class="pick" id="atNew">
                 <b>${ic('plus', 'ic-14')} Créer la piste « ${esc(txt)} »</b>
                 <span>et y ranger le contact</span>
               </button>`;
    }
    q('#atList').innerHTML = html || '<p class="hint">Tape le nom de l’entreprise pour la retrouver ou la créer.</p>';
    q('#atList').querySelectorAll('.pick[data-id]').forEach(b =>
      b.addEventListener('click', () => attach(S.companies.find(x => x.id === b.dataset.id))));
    const nw = q('#atNew');
    if (nw) nw.addEventListener('click', () => {
      const nc = normalizeCompany({ id: uid(), name: txt, createdAt: Date.now() });
      nc.history = [{ d: todayISO(), t: 'Piste créée' }];
      S.companies.push(nc);
      logJ('Piste créée : ' + nc.name, nc.id);
      attach(nc);
    });
  };
  q('#atQ').addEventListener('input', debounce(renderList, 200));
  renderList();
}
