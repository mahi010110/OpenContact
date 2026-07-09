/* ============================================================
   OpenContact — interface · écrire un email
   Gabarit rempli (moteur), destinataire choisi, envoi via l'app
   mail de l'appareil. « Envoyée ✓ » nourrit le suivi puis propose
   la suite — c'est la boucle qui entretient « Aujourd'hui ».
   ============================================================ */
import { esc, todayISO } from '../engine/utils.js';
import { fillTpl, pushHist } from '../engine/model.js';
import { S, bus, saveData, logJ } from './state.js';
import { openSheet, toast, btn } from './dom.js';
import { askNextAction } from './actions.js';

export function openMail(c, opts){
  opts = opts || {};
  const cts = (c.contacts || []).filter(t => t.email);
  const tpls = S.profile.templates;
  let logged = false;
  /* en série (Prospecter) : prévenir la suite exactement une fois,
     que la feuille soit envoyée, passée ou fermée */
  let chained = false;
  const finish = () => { if (opts.onDone){ const f = opts.onDone; opts.onDone = null; f(); } };
  const sh = openSheet({
    title: 'Écrire — ' + c.name + (opts.progress ? '  ·  ' + opts.progress : ''),
    icon: 'mail', focus: cts.length ? '#mSubj' : '#mBody',
    onClose: () => { if (!chained) finish(); }
  });
  sh.body.innerHTML =
    `<div class="grid2">
       <div class="field"><label for="mTo">Destinataire</label>
         <select id="mTo">${cts.length
           ? cts.map((t, i) => `<option value="${i}">${esc(t.name || t.email)}${t.role ? ' — ' + esc(t.role) : ''}</option>`).join('')
           : '<option value="">Aucun email sur cette piste</option>'}</select></div>
       <div class="field"><label for="mTpl">Modèle</label>
         <select id="mTpl">${tpls.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}</select></div>
     </div>
     <div class="field"><label for="mSubj">Objet</label><input id="mSubj"></div>
     <div class="field"><label for="mBody">Message</label><textarea id="mBody" style="min-height:170px"></textarea></div>
     <p class="hint" id="mHint"></p>
     ${!S.profile.name ? `<p class="hint warn">Ton profil est vide — remplis-le dans « Moi » et tes emails partiront signés et complets.</p>` : ''}`;

  const q = s => sh.body.querySelector(s);
  const currentCt = () => cts[+q('#mTo').value] || (c.contacts || [])[0] || null;
  const aMail = document.createElement('a');
  aMail.className = 'btn btn-primary';
  aMail.textContent = 'Ouvrir dans Mail';
  aMail.style.textDecoration = 'none';

  function fill(){
    const t = tpls[+q('#mTpl').value || 0];
    if (!t) return;
    const ct = currentCt();
    q('#mSubj').value = fillTpl(t.subject, c, ct, S.profile);
    q('#mBody').value = fillTpl(t.body, c, ct, S.profile);
    sync();
  }
  function sync(){
    const ct = currentCt();
    const email = ct && ct.email;
    if (email){
      aMail.href = 'mailto:' + encodeURIComponent(email) +
        '?subject=' + encodeURIComponent(q('#mSubj').value) +
        '&body=' + encodeURIComponent(q('#mBody').value);
      aMail.classList.remove('btn-off');
      q('#mHint').textContent = 'Destinataire : ' + email;
    } else {
      aMail.removeAttribute('href');
      aMail.classList.add('btn-off');
      q('#mHint').textContent = 'Pas d’email sur cette piste — copie le message et envoie-le via LinkedIn ou le formulaire du site.';
    }
  }
  /* trace « préparé » une seule fois, au premier geste concret */
  function logPrep(){
    if (logged) return;
    logged = true;
    const ct = currentCt();
    const who = ct ? (ct.name || ct.email) : '';
    pushHist(c, 'Email préparé' + (who ? ' — ' + who : ''));
    logJ('Email préparé : ' + c.name + (who ? ' (' + who + ')' : ''), c.id);
    saveData();
  }
  q('#mTo').addEventListener('change', fill);
  q('#mTpl').addEventListener('change', fill);
  q('#mSubj').addEventListener('input', sync);
  q('#mBody').addEventListener('input', sync);
  aMail.addEventListener('click', logPrep);

  sh.setFoot([
    btn('Copier', '', async () => {
      logPrep();
      try {
        await navigator.clipboard.writeText('Objet : ' + q('#mSubj').value + '\n\n' + q('#mBody').value);
        toast('Message copié.');
      } catch (e) {
        q('#mBody').select();
        toast('Sélectionné — copie avec Ctrl/Cmd+C.');
      }
    }, 'copy'),
    aMail,
    btn('Envoyée ✓', '', () => {
      const ct = currentCt();
      const who = ct ? (ct.name || ct.email) : '';
      pushHist(c, 'Email envoyé' + (who ? ' — ' + who : ''));
      logJ('Email envoyé : ' + c.name + (who ? ' (' + who + ')' : ''), c.id);
      if (c.status === 'todo') c.status = 'active';
      if (!c.appliedAt) c.appliedAt = todayISO();
      c.updatedAt = Date.now();
      saveData();
      chained = true;
      sh.close();
      bus.refresh();
      askNextAction(c, {
        title: 'Envoyé ✓ — et ensuite ?',
        preset: 'Relancer' + (who ? ' ' + who : ''),
        onDone: finish
      });
    })
  ]);
  if (opts.onDone){
    const skip = btn('Passer →', 'btn-ghost', () => sh.close());
    sh.ov.querySelector('.modal-f').prepend(skip);
  }
  fill();
}
