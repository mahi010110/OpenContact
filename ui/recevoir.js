/* ============================================================
   OpenContact — interface · Recevoir de la promo
   Scanner un QR / ouvrir un fichier / coller du texte → aperçu
   AVANT (« 12 reçues, dont 4 nouvelles », fusion à blanc sur une
   copie) → fusion réelle sans écrasement → « Annuler » ~30 s
   (instantané restauré tel quel).
   ============================================================ */
import { parseInput } from '../engine/exchange.js';
import { mergeIncoming } from '../engine/merge.js';
import { normalizeCompany } from '../engine/model.js';
import { S, bus, saveData, logJ } from './state.js';
import { openSheet, toast, btn, ic, showUndo } from './dom.js';
import { startScan } from './qr.js';

export function openRecevoir(){
  let stopScan = null;
  const halt = () => { if (stopScan){ stopScan(); stopScan = null; } };
  /* la caméra se coupe quelle que soit la façon de fermer la feuille */
  const sh = openSheet({ title: 'Recevoir', icon: 'inbox', onClose: halt });
  const q = s => sh.body.querySelector(s);

  const menu = () => {
    halt();
    sh.setTitle('Recevoir');
    sh.body.innerHTML =
      `<div class="pick-list">
         <button class="pick" id="rcScan"><b>${ic('grid-3x3', 'ic-14')} Scanner un QR</b><span>l’écran d’un camarade, ou ton ordinateur</span></button>
         <button class="pick" id="rcFile"><b>${ic('folder', 'ic-14')} Ouvrir un fichier .oc</b><span>reçu par mail, WhatsApp, clé USB…</span></button>
         <button class="pick" id="rcPaste"><b>${ic('clipboard', 'ic-14')} Coller du texte</b><span>un partage copié-collé</span></button>
       </div>
       <p class="hint">${ic('shield', 'ic-14')} Aperçu avant fusion, rien n’est écrasé, et tu peux annuler juste après.</p>
       <input type="file" id="rcInput" accept=".oc,.txt,.json,application/octet-stream,text/plain,application/json" hidden>`;
    q('#rcScan').addEventListener('click', scan);
    q('#rcFile').addEventListener('click', () => q('#rcInput').click());
    q('#rcPaste').addEventListener('click', paste);
    q('#rcInput').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => treat(String(r.result));
      r.readAsText(f);
    });
    sh.setFoot([btn('Fermer', 'btn-ghost', () => sh.close())]);
  };

  /* ---- scanner ---- */
  const scan = async () => {
    sh.setTitle('Scanner');
    sh.body.innerHTML =
      `<div class="scan-box"><video id="rcVideo" playsinline muted></video><div class="scan-mark"></div></div>
       <p class="hint" style="text-align:center">Vise le QR — la lecture est automatique.</p>`;
    sh.setFoot([btn('← Retour', 'btn-ghost', menu)]);
    try {
      stopScan = await startScan(q('#rcVideo'), raw => { halt(); treat(raw); });
    } catch (e) {
      toast('Caméra indisponible ou refusée — passe par le fichier ou le collage.');
      menu();
    }
  };

  /* ---- coller ---- */
  const paste = () => {
    sh.setTitle('Coller');
    sh.body.innerHTML =
      `<div class="field"><label for="rcTxt">Le texte reçu</label>
         <textarea id="rcTxt" style="min-height:140px" placeholder="Colle ici le contenu partagé (JSON, OC2., OCQ1., OC1.)"></textarea></div>`;
    sh.setFoot([btn('← Retour', 'btn-ghost', menu), btn('Lire', 'btn-primary', () => treat(q('#rcTxt').value))]);
    q('#rcTxt').focus();
  };

  /* ---- mot de passe (fichiers OC2) ---- */
  const askPass = raw => {
    sh.setTitle('Fichier protégé');
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 10px">${ic('lock', 'ic-14')} Ce partage est chiffré — demande le mot de passe à la personne qui te l’a donné.</p>
       <div class="field"><label for="rcPass">Mot de passe</label>
         <input id="rcPass" type="password" autocomplete="off"></div>`;
    const go = () => treat(raw, q('#rcPass').value);
    sh.setFoot([btn('← Retour', 'btn-ghost', menu), btn('Déverrouiller', 'btn-primary', go)]);
    q('#rcPass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    q('#rcPass').focus();
  };

  /* ---- lecture + aperçu ---- */
  const ERRS = {
    vide: 'Rien à lire — le contenu est vide.',
    format: 'Format non reconnu — est-ce bien un partage OpenContact ?',
    motdepasse: 'Mot de passe incorrect.',
    troplourd: 'Fichier trop lourd (plus de 4 Mo) — refusé par prudence.',
    tropdepistes: 'Plus de 2 000 pistes — refusé par prudence.',
    altéré: 'Le contenu a été modifié depuis son scellement — refusé.',
    noqr: 'Ce navigateur ne sait pas lire ce format compact.'
  };
  const treat = async (raw, pass) => {
    halt();
    let obj;
    try {
      obj = await parseInput(raw, pass);
    } catch (e) {
      if (e.message === 'besoinpass'){ askPass(raw); return; }
      toast(ERRS[e.message] || 'Lecture impossible : ' + e.message);
      if (e.message === 'motdepasse') askPass(raw);
      return;
    }
    /* fusion à blanc sur une copie : l'aperçu dit tout, rien n'est touché */
    const dry = mergeIncoming(obj.companies, JSON.parse(JSON.stringify(S.companies)));
    const n = obj.companies.length;
    sh.setTitle('Aperçu avant fusion');
    sh.body.innerHTML =
      `<div class="rc-recap">
         <div class="rc-big">${n} piste${n > 1 ? 's' : ''} reçue${n > 1 ? 's' : ''}</div>
         <ul class="rc-lines">
           <li>${ic('plus', 'ic-14')} <b>${dry.addedC}</b> nouvelle${dry.addedC > 1 ? 's' : ''}</li>
           <li>${ic('pencil', 'ic-14')} <b>${dry.enriched}</b> complétée${dry.enriched > 1 ? 's' : ''} (champs vides remplis)</li>
           <li>${ic('contact', 'ic-14')} <b>${dry.addedCt}</b> contact${dry.addedCt > 1 ? 's' : ''} ajouté${dry.addedCt > 1 ? 's' : ''}</li>
           ${dry.conflicts ? `<li class="rc-warn">${ic('square-alert', 'ic-14')} <b>${dry.conflicts}</b> divergence${dry.conflicts > 1 ? 's' : ''} signalée${dry.conflicts > 1 ? 's' : ''} — l’existant est gardé</li>` : ''}
         </ul>
         ${obj.kind === 'full' ? `<p class="hint">${ic('info-box', 'ic-14')} C’est une sauvegarde complète : seules les pistes fusionnent ici (profil ignoré). Pour restaurer entièrement, passe par « Moi ».</p>` : ''}
         <p class="hint">${ic('shield', 'ic-14')} Rien n’est écrasé : l’existant gagne toujours, le reçu complète les vides.</p>
       </div>`;
    sh.setFoot([
      btn('Annuler', 'btn-ghost', menu),
      btn(dry.addedC + dry.enriched + dry.addedCt === 0 ? 'Rien à ajouter' : 'Fusionner', 'btn-primary', () => {
        const snapshot = JSON.stringify(S.companies);
        const stats = mergeIncoming(obj.companies, S.companies);
        saveData();
        logJ('Reçu de la promo : +' + stats.addedC + ' piste(s), ' + stats.enriched + ' complétée(s)');
        sh.close();
        bus.refresh();
        offerUndo(snapshot, stats);
      })
    ]);
  };

  menu();
}

/* ---- « Annuler » ~30 s : l'instantané d'avant fusion, restauré tel quel ---- */
function offerUndo(snapshot, stats){
  showUndo(
    `${ic('check', 'ic-14')} Fusion faite : +${stats.addedC} nouvelle${stats.addedC > 1 ? 's' : ''}, ${stats.enriched} complétée${stats.enriched > 1 ? 's' : ''}.`,
    () => {
      S.companies = JSON.parse(snapshot).map(normalizeCompany);
      saveData();
      logJ('Fusion annulée');
      bus.refresh();
      toast('Fusion annulée — tout est revenu comme avant.');
    });
}
