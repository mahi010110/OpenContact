/* ============================================================
   OpenContact — interface · modifier la fiche (champs partagés)
   Tout ce qui peut circuler dans un partage : identité, domaine,
   site, adresse, technos, postes, process, conseils. Le suivi
   privé (statut, notes, actions) ne passe jamais par ici.
   ============================================================ */
import { esc } from '../engine/utils.js';
import { DOMAINS, POSITIONS, pushHist } from '../engine/model.js';
import { bus, saveData, logJ } from './state.js';
import { openSheet, toast, btn } from './dom.js';

const FIELDS = ['name','city','domain','desc','website','address','techs','process','tips'];

export function openEditPiste(c, onDone){
  const sh = openSheet({ title: 'Modifier — ' + c.name, icon: 'pencil', className: 'modal-fiche', focus: '#edName' });
  sh.body.innerHTML =
    `<p class="hint" style="margin:0 0 14px"><span class="tag-share">partagé</span> Ces infos circulent dans les partages — ton suivi jamais.</p>
     <div class="grid2">
       <div class="field"><label for="edName">Entreprise *</label><input id="edName" value="${esc(c.name)}"></div>
       <div class="field"><label for="edCity">Ville</label><input id="edCity" value="${esc(c.city)}"></div>
     </div>
     <div class="field"><label for="edDomain">Domaine</label>
       <select id="edDomain">${Object.keys(DOMAINS).map(k =>
         `<option value="${k}"${c.domain === k ? ' selected' : ''}>${DOMAINS[k].label}</option>`).join('')}</select></div>
     <div class="field"><label for="edDesc">En un mot</label>
       <textarea id="edDesc" class="ta-s" placeholder="Ce qu'elle fait, pourquoi elle t'intéresse">${esc(c.desc)}</textarea></div>
     <div class="grid2">
       <div class="field"><label for="edWebsite">Site web</label>
         <input id="edWebsite" type="url" value="${esc(c.website)}" placeholder="https://…" autocomplete="off"></div>
       <div class="field"><label for="edAddress">Adresse</label>
         <input id="edAddress" value="${esc(c.address)}" placeholder="Ex : 12 rue…, 59000 Lille" autocomplete="off"></div>
     </div>
     <div class="field"><label for="edTechs">Technos <span class="lbl-soft">— ce qu'on y pratique</span></label>
       <input id="edTechs" value="${esc(c.techs)}" placeholder="Ex : SOC, Fortinet, Linux" autocomplete="off"></div>
     <div class="field"><label id="edPosL">Postes recherchés</label>
       <div class="datechips" role="group" aria-labelledby="edPosL">
         ${Object.keys(POSITIONS).map(k =>
           `<button class="dchip${c.positions.includes(k) ? ' on' : ''}" data-p="${k}"
                    aria-pressed="${c.positions.includes(k)}">${POSITIONS[k]}</button>`).join('')}
       </div></div>
     <div class="field"><label for="edProcess">Process de recrutement</label>
       <textarea id="edProcess" class="ta-s" placeholder="Ex : CV → entretien RH → test technique">${esc(c.process)}</textarea></div>
     <div class="field"><label for="edTips">Conseils pour postuler</label>
       <textarea id="edTips" class="ta-s" placeholder="Ex : passer par le forum, citer tel projet…">${esc(c.tips)}</textarea></div>`;
  const q = s => sh.body.querySelector(s);

  sh.body.querySelectorAll('.dchip').forEach(b =>
    b.addEventListener('click', () => {
      b.classList.toggle('on');
      b.setAttribute('aria-pressed', b.classList.contains('on'));
    }));

  sh.setFoot([
    btn('Annuler', 'btn-ghost', () => sh.close()),
    btn('Enregistrer', 'btn-primary', () => {
      const name = q('#edName').value.trim();
      if (!name){ toast('Le nom de la structure est obligatoire.'); q('#edName').focus(); return; }
      const before = JSON.stringify(FIELDS.map(f => c[f]).concat([c.positions]));
      c.name = name;
      c.city = q('#edCity').value.trim();
      c.domain = q('#edDomain').value;
      c.desc = q('#edDesc').value.trim();
      c.website = q('#edWebsite').value.trim();
      c.address = q('#edAddress').value.trim();
      c.techs = q('#edTechs').value.trim();
      c.process = q('#edProcess').value.trim();
      c.tips = q('#edTips').value.trim();
      c.positions = Array.from(sh.body.querySelectorAll('.dchip.on')).map(b => b.dataset.p);
      if (JSON.stringify(FIELDS.map(f => c[f]).concat([c.positions])) !== before){
        pushHist(c, 'Fiche complétée');
        logJ('Fiche complétée : ' + c.name, c.id);
        c.updatedAt = Date.now();
        saveData();
        toast('Fiche enregistrée ✓');
      }
      sh.close();
      bus.refresh();
      if (onDone) onDone();
    })
  ]);
}
