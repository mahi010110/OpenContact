/* ============================================================
   OpenContact — interface · écrire un email
   Gabarit rempli (moteur), destinataire choisi, envoi via l'app
   mail de l'appareil — ou DIRECTEMENT depuis l'app quand une
   messagerie est connectée (l'adresse d'envoi est visible, le
   repli « Ouvrir dans Mail » reste à un tap, une expiration ne
   perd jamais le brouillon). « Envoyé ✓ » nourrit le suivi puis
   propose la suite — la boucle qui entretient « Aujourd'hui ».
   ============================================================ */
import { esc, todayISO } from '../engine/utils.js';
import { fillTpl, pushHist } from '../engine/model.js';
import { sendMail } from '../engine/mailer.js';
import { aiComplete, draftPrompt } from '../engine/ai.js';
import { S, bus, saveData, logJ } from './state.js';
import { openSheet, toast, btn, el, ic } from './dom.js';
import { askNextAction } from './actions.js';
import { mailAccount, freshToken, openConnexions, aiConnection } from './connexions.js';

export function openMail(c, opts){
  opts = opts || {};
  const cts = (c.contacts || []).filter(t => t.email);
  const tpls = S.profile.templates;
  let logged = false;
  /* en série (Prospecter) : « Passer » ou « Envoyée » enchaînent la
     suivante ; la croix (ou Échap) arrête TOUTE la série immédiatement */
  let done = false;
  const advance = () => { if (opts.onDone){ const f = opts.onDone; opts.onDone = null; f(); } };
  const sh = openSheet({
    title: 'Écrire — ' + c.name + (opts.progress ? '  ·  ' + opts.progress : ''),
    icon: 'mail', focus: cts.length ? '#mSubj' : '#mBody',
    onClose: () => { if (done) return; done = true; if (opts.onQuit) opts.onQuit(); }
  });
  const acct = mailAccount();       /* messagerie connectée ? */
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
     <div class="field"><label for="mBody">Message</label><textarea id="mBody" style="min-height:170px"></textarea>
       ${aiConnection() ? `<button class="linklike" id="mAi" style="margin-top:2px">${ic('sparkles', 'ic-14')} Proposer un brouillon</button>` : ''}</div>
     <p class="hint" id="mHint"></p>
     ${!S.profile.name ? `<p class="hint warn">Profil vide — remplis-le dans « Moi » pour signer tes emails.</p>` : ''}`;

  const q = s => sh.body.querySelector(s);
  const currentCt = () => cts[+q('#mTo').value] || (c.contacts || [])[0] || null;
  const aMail = document.createElement('a');
  aMail.className = 'btn';
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
      q('#mHint').innerHTML = acct
        ? `Depuis <b>${esc(acct.email || 'ta messagerie')}</b> → ${esc(email)}`
        : `Destinataire : ${esc(email)} <button class="linklike" id="mDirect" style="min-height:0;padding:0 4px">Envoyer directement depuis l’app ?</button>`;
      q('#mDirect')?.addEventListener('click', () => openConnexions());
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
  /* la boucle d'après-envoi — la même, que l'envoi soit direct ou marqué */
  function markSentAndFollow(){
    const ct = currentCt();
    const who = ct ? (ct.name || ct.email) : '';
    pushHist(c, 'Email envoyé' + (who ? ' — ' + who : ''));
    logJ('Email envoyé : ' + c.name + (who ? ' (' + who + ')' : ''), c.id);
    if (c.status === 'todo') c.status = 'active';
    if (!c.appliedAt) c.appliedAt = todayISO();
    c.updatedAt = Date.now();
    saveData();
    done = true;
    sh.close();
    bus.refresh();
    askNextAction(c, {
      title: 'Envoyé ✓ — et ensuite ?',
      preset: 'Relancer' + (who ? ' ' + who : ''),
      onDone: advance
    });
  }
  q('#mTo').addEventListener('change', fill);
  q('#mTpl').addEventListener('change', fill);
  q('#mSubj').addEventListener('input', sync);
  q('#mBody').addEventListener('input', sync);
  aMail.addEventListener('click', logPrep);
  /* brouillon IA : le texte tombe dans le champ ÉDITABLE — relecture
     par construction, le gabarit reste le repli */
  q('#mAi')?.addEventListener('click', async () => {
    const b = q('#mAi');
    b.disabled = true;
    b.textContent = 'L’IA rédige…';
    try {
      const ct = currentCt();
      const txt = await aiComplete(aiConnection(), draftPrompt({
        company: c, contactName: ct && ct.name, contactRole: ct && ct.role, profile: S.profile
      }));
      if (txt){ q('#mBody').value = txt; sync(); toast('Brouillon proposé — relis avant d’envoyer.'); }
      else toast('L’IA n’a rien proposé — le modèle reste là.');
    } catch (e) {
      toast(e.message === 'quota' ? 'Quota IA atteint — le modèle reste là.'
        : e.message === 'cle' ? 'Clé refusée — vérifie-la dans Connexions.'
        : 'L’IA ne répond pas — le modèle reste là.');
    }
    b.disabled = false;
    b.innerHTML = ic('sparkles', 'ic-14') + ' Proposer un brouillon';
  });

  const bCopy = btn('Copier', '', async () => {
    logPrep();
    try {
      await navigator.clipboard.writeText('Objet : ' + q('#mSubj').value + '\n\n' + q('#mBody').value);
      toast('Message copié.');
    } catch (e) {
      q('#mBody').select();
      toast('Sélectionné — copie avec Ctrl/Cmd+C.');
    }
  }, 'copy');
  const bMarked = btn('Envoyée ✓', '', markSentAndFollow);

  /* jeton expiré / révoqué : le brouillon ne bouge pas, la
     reconnexion s'empile au-dessus */
  const askReconnect = () => {
    const s2 = openSheet({
      title: (acct.provider === 'gmail' ? 'Gmail' : 'Outlook') + ' demande de te reconnecter',
      icon: 'mail', className: 'modal-confirm'
    });
    s2.body.innerHTML = '<p class="cf-msg">Ton brouillon ne bouge pas.</p>';
    s2.setFoot([
      el(`<a class="btn" href="${aMail.href || '#'}" style="text-decoration:none">Ouvrir dans Mail</a>`),
      btn('Reconnecter', 'btn-primary', () => { s2.close(); openConnexions(); })
    ]);
  };
  const doSend = async () => {
    const ct = currentCt();
    if (!ct || !ct.email) return;
    logPrep();
    bSend.disabled = true;
    bSend.textContent = 'Envoi…';
    try {
      const token = await freshToken(acct.provider);
      await sendMail(acct.provider, token, {
        from: acct.email, to: ct.email,
        subject: q('#mSubj').value, body: q('#mBody').value
      });
      markSentAndFollow();
    } catch (e) {
      bSend.disabled = false;
      bSend.textContent = 'Envoyer';
      if (e.message === 'expire') askReconnect();
      else toast('Pas parti — réessaie, ou ouvre dans Mail.');
    }
  };
  const bSend = acct ? btn('Envoyer', 'btn-primary', doSend, 'mail') : null;

  if (acct){
    /* connecté : Envoyer est LE primaire ; passer par Mail re-propose
       le marquage à la main (le pied redevient l'historique) */
    sh.setFoot([bCopy, aMail, bSend]);
    aMail.classList.add('btn-ghost');
    aMail.addEventListener('click', () => {
      sh.setFoot([bCopy, aMail, bMarked]);
      aMail.classList.remove('btn-ghost');
    });
    /* ordinateur : Ctrl/Cmd+Entrée envoie */
    sh.body.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !bSend.disabled) doSend();
    });
  } else {
    aMail.classList.add('btn-primary');
    sh.setFoot([bCopy, aMail, bMarked]);
  }
  if (opts.onDone){
    const skip = btn('Passer →', 'btn-ghost', () => { done = true; sh.close(); advance(); });
    sh.ov.querySelector('.modal-f').prepend(skip);
  }
  fill();
}
