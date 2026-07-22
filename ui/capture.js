/* ============================================================
   OpenContact — interface · capture éclair (#7)
   Une piste = l'entreprise ET le contact, saisis ensemble : deux
   blocs, on remplit ce qu'on a. « Ajouter » enchaîne (rafale) ;
   « Ajouter et compléter » ouvre la fiche pour le reste. Une
   personne sans entreprise part dans le bac « à rattacher » —
   jamais bloqué, rien ne se perd. L'anti-doublon (moteur) demande
   avant de créer un homonyme.
   ============================================================ */
import { esc, uid, todayISO, debounce } from '../engine/utils.js';
import { normalizeCompany, contactHasData } from '../engine/model.js';
import { findMatch } from '../engine/merge.js';
import { S, bus, saveData, logJ, addOrphan, attachContact, ctLabel } from './state.js';
import { openSheet, toast, btn, ic } from './dom.js';
import { openFiche } from './fiche.js';

/* nadia@ovhcloud.com → « Ovhcloud » : l'entreprise se devine de l'email —
   proposée en un tap, jamais imposée. Les domaines personnels se taisent. */
const PERSO = ['gmail', 'outlook', 'hotmail', 'yahoo', 'orange', 'free', 'laposte',
  'wanadoo', 'sfr', 'icloud', 'protonmail', 'proton', 'live', 'msn', 'gmx', 'aol'];
export function companyFromEmail(email){
  const m = /@([a-z0-9-]+)\./i.exec(String(email || '').trim());
  if (!m) return '';
  const dom = m[1].toLowerCase();
  if (PERSO.includes(dom) || dom.length < 3) return '';
  return dom[0].toUpperCase() + dom.slice(1);
}

export function openCapture(prefill){
  prefill = prefill || {};
  const sh = openSheet({ title: prefill.website ? 'Piste reçue du partage' : 'Nouvelle piste', icon: 'plus', focus: '#cpName' });
  sh.body.innerHTML =
    `<div class="lbl-row"><label for="cpName">L’entreprise</label></div>
     <div class="field">
       <input id="cpName" value="${esc(prefill.name || '')}" placeholder="Ex : Orange Cyberdefense" autocomplete="off">
       <div class="dup-note" id="cpDup" hidden></div>
       <button class="linklike" id="cpFromMail" hidden></button>
     </div>
     ${prefill.website ? `<div class="cp-carry">${ic('link', 'ic-14')} <span>${esc(prefill.website)}</span></div>` : ''}
     <div class="lbl-row"><label for="cpCtName">Le contact <span class="lbl-soft">— si tu en as un</span></label></div>
     <div class="field">
       <input id="cpCtName" placeholder="Ex : Nadia Rahmani" autocomplete="off">
     </div>
     <div class="field">
       <input id="cpCtCoord" placeholder="Son email ou son téléphone" autocomplete="off">
     </div>
     <button class="linklike" id="cpMails">${ic('sparkles', 'ic-14')} Depuis mes e-mails</button>`;
  const q = s => sh.body.querySelector(s);
  const v = s => q(s).value.trim();

  /* ce que dit le champ « email ou téléphone » */
  const coord = () => {
    const t = v('#cpCtCoord');
    if (!t) return {};
    if (t.includes('@')) return { email: t };
    if (t.replace(/\D/g, '').length >= 8) return { phone: t };
    return { note: t };
  };
  const contactData = () => {
    const data = Object.assign({ id: uid(), name: v('#cpCtName') }, coord());
    return contactHasData(data) ? data : null;
  };

  /* anti-doublon (sur le nom) + entreprise devinée de l'email */
  let dup = null;
  const checkDup = () => {
    const name = v('#cpName');
    dup = name ? findMatch({ name }, S.companies) : null;
    const box = q('#cpDup');
    if (dup){
      box.hidden = false;
      box.innerHTML =
        `${ic('square-alert', 'ic-14')} Tu as déjà <b>${esc(dup.name)}</b>${dup.city ? ' (' + esc(dup.city) + ')' : ''} — c’est la même entreprise ?
         <button class="btn btn-sm" id="cpOpen">Ouvrir sa fiche</button>`;
      box.querySelector('#cpOpen').addEventListener('click', () => {
        /* rien ne se perd : le lien reçu et le contact saisi complètent
           la fiche existante (jamais d'écrasement) */
        if (prefill.website && !dup.website){
          dup.website = prefill.website;
          dup.updatedAt = Date.now();
          saveData();
        }
        const ct = contactData();
        if (ct){ attachContact(dup, ct); toast(ctLabel(ct) + ' → rangé dans « ' + dup.name + ' » ✓'); }
        sh.close();
        openFiche(dup);
      });
      bAdd.textContent = 'Créer quand même';
    } else {
      box.hidden = true;
      bAdd.textContent = 'Ajouter';
    }
  };
  const checkMail = () => {
    const b = q('#cpFromMail');
    const guess = !v('#cpName') && companyFromEmail(coord().email);
    b.hidden = !guess;
    if (guess){
      b.innerHTML = `${ic('lightbulb', 'ic-14')} <span>Entreprise : <b>${esc(guess)}</b> ?</span>`;
      b.onclick = () => { q('#cpName').value = guess; checkDup(); checkMail(); };
    }
  };

  /* créer — rend la piste (ou null si c'était un contact seul → bac) */
  const save = () => {
    const name = v('#cpName');
    const ct = contactData();
    if (!name && !ct){
      toast('Une entreprise, ou au moins une personne.');
      q('#cpName').focus();
      return undefined;
    }
    if (!name){
      /* la personne seule va au bac « à rattacher » — jamais bloqué */
      addOrphan(ct);
      toast('✓ ' + ctLabel(ct) + ' gardé de côté');
      return null;
    }
    const c = normalizeCompany({
      id: uid(), name,
      website: prefill.website || '', desc: prefill.desc || '',
      contacts: ct ? [ct] : [],
      createdAt: Date.now()
    });
    c.history = [{ d: todayISO(), t: prefill.website ? 'Piste reçue du partage' : 'Piste créée' }];
    S.companies.push(c);
    saveData();
    logJ('Piste créée : ' + c.name, c.id);
    return c;
  };

  /* « Ajouter » = rafale : créé, vidé, prêt pour la suivante */
  const bAdd = btn('Ajouter', 'btn-primary', () => {
    const c = save();
    if (c === undefined) return;
    if (c) toast('✓ ' + c.name + ' ajoutée');
    ['#cpName', '#cpCtName', '#cpCtCoord'].forEach(s => { q(s).value = ''; });
    prefill = {};
    checkDup();
    checkMail();
    bus.refresh();
    q('#cpName').focus();
  });
  /* « Ajouter et compléter » = créé ET la fiche s'ouvre pour le reste */
  const bMore = btn('Ajouter et compléter', '', () => {
    const c = save();
    if (c === undefined) return;
    sh.close();
    bus.refresh();
    if (c) openFiche(c);
  });

  /* l'import d'e-mails est une SOURCE de pistes (#5) — il vit ici,
     pas dans « Recevoir » (réservé à ce qu'un camarade envoie) */
  q('#cpMails').addEventListener('click', async () => {
    sh.close();
    (await import('./recevoir.js')).openImportMails();
  });
  q('#cpName').addEventListener('input', debounce(checkDup, 250));
  q('#cpCtCoord').addEventListener('input', debounce(checkMail, 250));
  sh.body.querySelectorAll('input').forEach(i =>
    i.addEventListener('keydown', e => { if (e.key === 'Enter') bAdd.click(); }));
  sh.setFoot([bMore, bAdd]);
  checkDup();
  checkMail();
}
