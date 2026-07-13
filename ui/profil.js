/* ============================================================
   OpenContact — interface · profil & modèles d'emails
   Le profil remplit les emails ({{moi}}, {{formation}}, {{tel}}…),
   les modèles se gèrent ici : modifier, ajouter, retirer,
   revenir aux modèles de départ. Tout reste local.
   ============================================================ */
import { esc, uid } from '../engine/utils.js';
import { defaultTemplates } from '../engine/model.js';
import { S, bus, saveProfile } from './state.js';
import { openSheet, confirmSheet, toast, btn, ic } from './dom.js';

/* ---------- profil ---------- */
export function openProfil(onDone){
  const p = S.profile;
  const sh = openSheet({ title: 'Mon profil', icon: 'user', focus: '#pfName' });
  sh.body.innerHTML =
    `<p class="hint" style="margin:0 0 14px">${ic('lock', 'ic-14')} Privé — sert à remplir tes emails.</p>
     <div class="grid2">
       <div class="field"><label for="pfName">Prénom & nom</label>
         <input id="pfName" value="${esc(p.name)}" placeholder="Ex : Sam Martin" autocomplete="name"></div>
       <div class="field"><label for="pfFormation">Formation</label>
         <input id="pfFormation" value="${esc(p.formation)}" placeholder="Ex : BTS SIO 2e année" autocomplete="off"></div>
     </div>
     <div class="grid2">
       <div class="field"><label for="pfPhone">Téléphone</label>
         <input id="pfPhone" type="tel" value="${esc(p.phone)}" autocomplete="tel"></div>
       <div class="field"><label for="pfEmail">Email</label>
         <input id="pfEmail" type="email" value="${esc(p.email)}" autocomplete="email"></div>
     </div>
     <div class="field"><label for="pfCv">Lien CV <span class="lbl-soft">— pour {{cv}} dans les emails</span></label>
       <input id="pfCv" type="url" value="${esc(p.cvUrl)}" placeholder="https://…" autocomplete="off"></div>
     <div class="field"><label for="pfPortfolio">Portfolio / LinkedIn</label>
       <input id="pfPortfolio" type="url" value="${esc(p.portfolio)}" placeholder="https://…" autocomplete="off"></div>`;
  const v = s => sh.body.querySelector(s).value.trim();
  sh.setFoot([
    btn('Enregistrer', 'btn-primary', () => {
      p.name = v('#pfName'); p.formation = v('#pfFormation');
      p.phone = v('#pfPhone'); p.email = v('#pfEmail');
      p.cvUrl = v('#pfCv'); p.portfolio = v('#pfPortfolio');
      saveProfile();
      toast('Profil enregistré ✓ — tes emails se rempliront tout seuls.');
      sh.close();
      bus.refresh();
      if (onDone) onDone();
    })
  ]);
}

/* ---------- modèles d'emails ---------- */
const VARS = '{{entreprise}} {{contact}} {{ville}} {{moi}} {{formation}} {{tel}} {{email}} {{cv}} {{portfolio}}';

export function openTemplates(){
  const sh = openSheet({ title: 'Modèles d’emails', icon: 'mail' });
  const render = () => {
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 10px">Les variables se remplissent toutes seules au moment d’écrire : <code class="tpl-vars">${esc(VARS)}</code></p>
       <div class="pick-list">
         ${S.profile.templates.map((t, i) =>
           `<button class="pick" data-i="${i}">
              <b>${esc(t.name)}</b><span>${esc(t.subject.slice(0, 40))}${t.subject.length > 40 ? '…' : ''}</span>
            </button>`).join('')}
       </div>`;
    sh.body.querySelectorAll('.pick').forEach(b =>
      b.addEventListener('click', () => editTemplate(S.profile.templates[+b.dataset.i], render)));
    sh.setFoot([
      btn('Modèles de départ', 'btn-ghost', async () => {
        const ok = await confirmSheet({
          title: 'Revenir aux modèles de départ ?', danger: true, okLabel: 'Réinitialiser',
          msg: 'Tes modèles actuels seront remplacés par les trois modèles d’origine.'
        });
        if (!ok) return;
        S.profile.templates = defaultTemplates();
        saveProfile();
        toast('Modèles réinitialisés.');
        render();
      }),
      btn('Nouveau modèle', 'btn-primary', () =>
        editTemplate({ id: uid(), name: '', subject: '', body: '' }, render, true), 'plus')
    ]);
  };
  render();
}

function editTemplate(t, onBack, isNew){
  const sh = openSheet({ title: isNew ? 'Nouveau modèle' : t.name, icon: 'pencil', className: 'modal-fiche', focus: '#tpName' });
  sh.body.innerHTML =
    `<div class="field"><label for="tpName">Nom du modèle</label>
       <input id="tpName" value="${esc(t.name)}" placeholder="Ex : Relance après forum"></div>
     <div class="field"><label for="tpSubject">Objet</label>
       <input id="tpSubject" value="${esc(t.subject)}" placeholder="Ex : Candidature — {{formation}}"></div>
     <div class="field"><label for="tpBody">Message</label>
       <textarea id="tpBody" style="min-height:180px">${esc(t.body)}</textarea></div>
     <p class="hint">Variables : <code class="tpl-vars">${esc(VARS)}</code></p>`;
  const v = s => sh.body.querySelector(s).value;
  const foot = [
    btn('Enregistrer', 'btn-primary', () => {
      const name = v('#tpName').trim();
      if (!name){ toast('Donne un nom au modèle.'); return; }
      t.name = name;
      t.subject = v('#tpSubject');
      t.body = v('#tpBody');
      if (isNew) S.profile.templates.push(t);
      saveProfile();
      toast('Modèle enregistré ✓');
      sh.close();
      onBack();
    })
  ];
  if (!isNew && S.profile.templates.length > 1){
    foot.unshift(btn('Supprimer', 'btn-ghost btn-danger', async () => {
      const ok = await confirmSheet({
        title: 'Supprimer ce modèle ?', danger: true, okLabel: 'Supprimer',
        msg: '<b>' + esc(t.name) + '</b> sera retiré de la liste.'
      });
      if (!ok) return;
      S.profile.templates = S.profile.templates.filter(x => x.id !== t.id);
      saveProfile();
      sh.close();
      onBack();
    }, 'trash'));
  }
  sh.setFoot(foot);
}
