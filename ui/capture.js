/* ============================================================
   OpenContact — interface · capture éclair
   Un nom suffit pour enregistrer ; la ville est bienvenue mais
   optionnelle. L'anti-doublon (moteur) demande avant de créer un
   homonyme. À l'enregistrement : une seule question, « prochaine
   action ? ».
   ============================================================ */
import { esc, uid, todayISO, debounce } from '../engine/utils.js';
import { normalizeCompany } from '../engine/model.js';
import { findMatch } from '../engine/merge.js';
import { S, bus, saveData, logJ } from './state.js';
import { openSheet, toast, btn, ic } from './dom.js';
import { askNextAction } from './actions.js';
import { openFiche } from './fiche.js';

export function openCapture(prefill){
  prefill = prefill || {};
  const sh = openSheet({ title: 'Nouvelle piste', icon: 'plus', focus: '#cpName' });
  sh.body.innerHTML =
    `<div class="field"><label for="cpName">Entreprise / structure</label>
       <input id="cpName" value="${esc(prefill.name || '')}" placeholder="Ex : Orange Cyberdefense" autocomplete="off"></div>
     <div class="field"><label for="cpCity">Ville <span class="lbl-soft">— optionnelle</span></label>
       <input id="cpCity" value="${esc(prefill.city || '')}" placeholder="Ex : Lille" autocomplete="off"></div>
     <div class="dup-note" id="cpDup" hidden></div>
     <p class="hint">Ça suffit pour enregistrer — le reste (contacts, détails) se complète quand tu veux, depuis la fiche.</p>`;
  const q = s => sh.body.querySelector(s);

  let dup = null;
  const checkDup = () => {
    const name = q('#cpName').value.trim();
    dup = name ? findMatch({ name, city: q('#cpCity').value.trim() }, S.companies) : null;
    const box = q('#cpDup');
    if (dup){
      box.hidden = false;
      box.innerHTML =
        `${ic('square-alert', 'ic-14')} Tu as déjà <b>${esc(dup.name)}</b>${dup.city ? ' (' + esc(dup.city) + ')' : ''} — c’est la même entreprise ?
         <button class="btn btn-sm" id="cpOpen">Ouvrir sa fiche</button>`;
      box.querySelector('#cpOpen').addEventListener('click', () => { sh.close(); openFiche(dup); });
      bSave.textContent = 'Créer quand même';
    } else {
      box.hidden = true;
      bSave.textContent = 'Enregistrer la piste';
    }
  };
  const bSave = btn('Enregistrer la piste', 'btn-primary', () => {
    const name = q('#cpName').value.trim();
    if (!name){ toast('Le nom de la structure est obligatoire.'); q('#cpName').focus(); return; }
    const city = q('#cpCity').value.trim();
    const c = normalizeCompany({ id: uid(), name, city, createdAt: Date.now() });
    c.history = [{ d: todayISO(), t: 'Piste créée' }];
    S.companies.push(c);
    saveData();
    logJ('Piste créée : ' + c.name, c.id);
    sh.close();
    bus.refresh();
    askNextAction(c, { title: 'Enregistrée ✓ — prochaine action ?', preset: 'Contacter', laterLabel: 'Plus tard' });
  });
  q('#cpName').addEventListener('input', debounce(checkDup, 250));
  q('#cpCity').addEventListener('input', debounce(checkDup, 250));
  q('#cpName').addEventListener('keydown', e => { if (e.key === 'Enter') bSave.click(); });
  q('#cpCity').addEventListener('keydown', e => { if (e.key === 'Enter') bSave.click(); });
  sh.setFoot([btn('Annuler', 'btn-ghost', () => sh.close()), bSave]);
  checkDup();
}
