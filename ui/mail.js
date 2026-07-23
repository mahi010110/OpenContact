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
import { bytesToB64 } from '../engine/crypto.js';
import { docGet } from '../engine/storage.js';
import { aiComplete, draftPrompt } from '../engine/ai.js';
import { S, bus, saveData, logJ, activateContact } from './state.js';
import { openSheet, openPanel, toast, btn, el, ic } from './dom.js';
import { askNextAction } from './actions.js';
import { openProfil } from './profil.js';
import { listDocs, docKind, docTitle, pickPdf } from './docs.js';
import { mailAccount, freshToken, openConnexions, aiConnection, aiCompleteViaCompanion } from './connexions.js';

export function openMail(c, opts){
  opts = opts || {};
  const cts = (c.contacts || []).filter(t => t.email);
  const tpls = S.profile.templates;
  let logged = false;
  let sending = false;
  /* en série (Prospecter) : « Passer » ou « Envoyée » enchaînent la
     suivante ; la croix (ou Échap) arrête TOUTE la série immédiatement */
  let done = false;
  const advance = () => { if (opts.onDone){ const f = opts.onDone; opts.onDone = null; f(); } };
  /* desktop : le composeur prend la place de la fiche dans le panneau
     (#16, fin du double-modal N8) ; mobile : feuille comme avant */
  const wide = matchMedia('(min-width:901px)').matches;
  const sh = (wide ? openPanel : openSheet)({
    title: 'Écrire — ' + c.name + (opts.progress ? '  ·  ' + opts.progress : ''),
    icon: 'mail', focus: cts.length ? '#mSubj' : '#mBody',
    onClose: () => { if (done) return; done = true; if (opts.onQuit) opts.onQuit(); }
  });
  if (!sh) return;
  const acct = mailAccount();       /* messagerie connectée ? */
  /* la personne choisie arrive pré-sélectionnée (#14) — jamais devinée */
  const initIdx = Math.max(0, cts.findIndex(t => t.id === opts.ctId));
  sh.body.innerHTML =
    `<div class="grid2">
       <div class="field"><label for="mTo">Destinataire</label>
         <select id="mTo">${cts.length
           ? cts.map((t, i) => `<option value="${i}"${i === initIdx ? ' selected' : ''}>${esc(t.name || t.email)}${t.role ? ' — ' + esc(t.role) : ''}</option>`).join('')
           : '<option value="">Aucun email sur cette piste</option>'}</select></div>
       <div class="field"><label for="mTpl">Modèle</label>
         <select id="mTpl">${tpls.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}</select></div>
     </div>
     <div class="field"><label for="mSubj">Objet</label><input id="mSubj"></div>
     <div class="field"><label for="mBody">Message</label><textarea id="mBody" style="min-height:170px"></textarea>
       ${aiConnection() ? `<button class="linklike" id="mAi" style="margin-top:2px">${ic('sparkles', 'ic-14')} Proposer un brouillon</button>` : ''}</div>
     <div class="attach-line" id="mAttach"></div>
     <p class="hint" id="mHint"></p>
     ${!S.profile.name ? `<div class="pc-actions"><button class="btn btn-sm" id="mProfil">${ic('pencil', 'ic-14')} Compléter mon profil</button></div>` : ''}`;

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
  /* indisponible = absent (loi #6) : sans adresse, ni « Envoyer » ni
     « Ouvrir dans Mail » — « Copier » devient LE bouton. Le pied se
     recompose au changement de destinataire. */
  let manual = false;               /* passé par Mail : re-proposer « Envoyée ✓ » */
  let lastEmail = null;
  const syncFoot = () => {
    const ct = currentCt();
    const email = (ct && ct.email) || '';
    if (email === lastEmail) return;
    lastEmail = email;
    const foot = [bCopy];
    bCopy.classList.toggle('btn-primary', !email);
    if (email){
      foot.push(aMail);
      aMail.classList.toggle('btn-primary', !acct);
      aMail.classList.toggle('btn-ghost', !!acct && !manual);
      foot.push(acct && !manual ? bSend : bMarked);
    }
    sh.setFoot(foot);
    if (opts.onDone) sh.ov.querySelector('.modal-f').prepend(bSkip);
  };
  function sync(){
    const ct = currentCt();
    const email = ct && ct.email;
    if (email){
      aMail.href = 'mailto:' + encodeURIComponent(email) +
        '?subject=' + encodeURIComponent(q('#mSubj').value) +
        '&body=' + encodeURIComponent(q('#mBody').value);
      q('#mHint').innerHTML = acct
        ? `Depuis <b>${esc(acct.email || 'ta messagerie')}</b> → ${esc(email)}`
        : `Destinataire : ${esc(email)} <button class="linklike" id="mDirect" style="min-height:0;padding:0 4px">Envoyer directement depuis l’app ?</button>`;
      q('#mDirect')?.addEventListener('click', () => openConnexions());
    } else {
      aMail.removeAttribute('href');
      q('#mHint').textContent = 'Pas d’email — Copier, puis LinkedIn ou le site.';
    }
    syncFoot();
  }

  /* ---- joindre CV / LM : vraie pièce jointe PDF (#16, #4) ----
     La ligne n'existe qu'avec l'envoi direct (un mailto ne joint rien) ;
     sans aucun document, un « joindre un CV » discret la remplace. */
  const picked = { cv: '', lm: '' };
  let docs = [];
  async function renderAttach(){
    const box = q('#mAttach');
    if (!box || !acct) return;
    docs = await listDocs();
    if (!sh.body.isConnected) return;
    if (!docs.length){
      box.innerHTML = `<button class="linklike" id="mAttAdd">${ic('attachment', 'ic-14')} joindre un CV</button>`;
      box.querySelector('#mAttAdd').addEventListener('click', () =>
        pickPdf('cv', k => { picked.cv = k; renderAttach(); }));
      return;
    }
    const sel = kind =>
      `<label class="att-sel">${kind === 'cv' ? 'CV' : 'LM'}
         <select data-att="${kind}">
           <option value="">Aucun</option>
           ${docs.filter(d => docKind(d.key) === kind).map(d =>
             `<option value="${esc(d.key)}"${picked[kind] === d.key ? ' selected' : ''}>${esc(docTitle(d))}</option>`).join('')}
         </select>
       </label>`;
    box.innerHTML = `${ic('attachment', 'ic-14')} ${sel('cv')} ${sel('lm')}`;
    box.querySelectorAll('[data-att]').forEach(s =>
      s.addEventListener('change', () => { picked[s.dataset.att] = s.value; }));
  }
  /* les documents choisis, prêts pour l'envoi (base64) */
  async function pickedAttachments(){
    const out = [];
    for (const key of [picked.cv, picked.lm].filter(Boolean)){
      const d = await docGet(key).catch(() => null);
      if (!d || !d.blob) continue;
      const buf = new Uint8Array(await new Blob([d.blob]).arrayBuffer());
      out.push({ name: d.name || 'document.pdf', type: d.type || 'application/pdf', b64: bytesToB64(buf) });
    }
    return out;
  }
  /* trace « préparé » une seule fois, au premier geste concret */
  function logPrep(){
    if (logged) return;
    logged = true;
    const ct = currentCt();
    const who = ct ? (ct.name || ct.email) : '';
    if (ct) activateContact(c, ct);                     /* #14 : écrit = activé */
    pushHist(c, 'Email préparé' + (who ? ' — ' + who : ''));
    logJ('Email préparé : ' + c.name + (who ? ' (' + who + ')' : ''), c.id);
    saveData();
  }
  /* la boucle d'après-envoi — la même, que l'envoi soit direct ou marqué */
  function markSentAndFollow(){
    const ct = currentCt();
    const who = ct ? (ct.name || ct.email) : '';
    if (ct) activateContact(c, ct);                     /* #14 : écrit = activé */
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
      ctId: ct && ct.id,                                /* la relance vise la personne */
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
      const conn = aiConnection();
      const prompt = draftPrompt({
        company: c, contactName: ct && ct.name, contactRole: ct && ct.role, profile: S.profile
      });
      const txt = conn && conn.channel === 'companion'
        ? await aiCompleteViaCompanion(conn, prompt, { cancelled: () => !sh.body.isConnected })
        : await aiComplete(conn, prompt);
      if (!sh.body.isConnected) return;   /* feuille fermée entre-temps */
      if (txt){ q('#mBody').value = txt; sync(); toast('Brouillon proposé — relis avant d’envoyer.'); }
      else toast('L’IA n’a rien proposé — le modèle reste là.');
    } catch (e) {
      if (e.message === 'annule' || !sh.body.isConnected) return;   /* abandon voulu : silence */
      toast(e.message === 'quota' ? 'Quota IA atteint — le modèle reste là.'
        : e.message === 'cle' ? 'Clé refusée — vérifie-la dans Connexions.'
        : e.message === 'modele' ? 'Choisis un modèle dans Connexions — la liste vient du fournisseur.'
        : e.message === 'compagnon' ? 'Associe le Compagnon dans « Mes appareils » d’abord.'
        : e.message === 'eteint' ? 'Ton ordinateur est éteint — ouvre le Compagnon.'
        : e.message === 'runtime' ? 'Le moteur IA de ton ordinateur ne répond pas — il est bien installé ?'
        : e.message === 'occupe' ? 'Une rédaction est déjà en cours — un instant.'
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
    if (!ct || !ct.email){ toast('Ajoute une adresse e-mail — ou copie le message.'); return; }
    if (sending) return;
    sending = true;
    logPrep();
    bSend.disabled = true;
    bSend.textContent = 'Envoi…';
    try {
      const attachments = await pickedAttachments();
      const token = await freshToken(acct.provider);
      await sendMail(acct.provider, token, {
        from: acct.email, to: ct.email,
        subject: q('#mSubj').value, body: q('#mBody').value,
        attachments
      });
      markSentAndFollow();
    } catch (e) {
      sending = false;
      bSend.disabled = false;
      bSend.textContent = 'Envoyer';
      if (e.message === 'expire') askReconnect();
      else toast('Pas parti — réessaie, ou ouvre dans Mail.');
    }
  };
  const bSend = acct ? btn('Envoyer', 'btn-primary', doSend, 'mail') : null;
  const bSkip = btn('Passer →', 'btn-ghost', () => { done = true; sh.close(); advance(); });

  /* passer par Mail re-propose le marquage à la main */
  aMail.addEventListener('click', () => {
    if (!acct || manual) return;
    manual = true;
    lastEmail = null;
    syncFoot();
  });
  if (acct){
    /* ordinateur : Ctrl/Cmd+Entrée envoie */
    sh.body.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && lastEmail && !sending) doSend();
    });
  }
  q('#mProfil')?.addEventListener('click', () => openProfil(() => {
    if (!sh.body.isConnected) return;
    fill();
    if (S.profile.name) q('#mProfil')?.remove();
  }));
  fill();
  renderAttach();
}
