/* ============================================================
   OpenContact — interface · Recevoir de la promo
   Scanner un QR (données OU rendez-vous P2P — reconnu tout seul,
   le code se tape aussi sans caméra) / ouvrir un fichier / coller
   → aperçu AVANT (« 12 reçues, dont 4 nouvelles », fusion à blanc
   sur une copie) → fusion réelle sans écrasement → « Annuler »
   ~30 s (instantané restauré tel quel).
   ============================================================ */
import { esc } from '../engine/utils.js';
import { parseInput, makeOCQJoiner, rdvParse, rdvNorm } from '../engine/exchange.js';
import { mergeIncoming } from '../engine/merge.js';
import { normalizeCompany } from '../engine/model.js';
import { S, bus, saveData, logJ } from './state.js';
import { openSheet, toast, btn, ic, showUndo } from './dom.js';
import { openRoom } from './synclive.js';
import { startScan } from './qr.js';

export function openRecevoir(){
  let stopScan = null;
  let room = null;         /* salle de rendez-vous (QR OCR1 / code tapé) */
  let gen = 0;
  const halt = () => { if (stopScan){ stopScan(); stopScan = null; } };
  const leaveRdv = () => { if (room){ try { room.leave(); } catch (e) {} room = null; } };
  /* caméra et salle se coupent quelle que soit la façon de fermer */
  const sh = openSheet({ title: 'Recevoir', icon: 'inbox', onClose: () => { gen++; halt(); leaveRdv(); } });
  const q = s => sh.body.querySelector(s);

  const menu = () => {
    gen++;
    halt();
    leaveRdv();
    sh.setTitle('Recevoir');
    sh.body.innerHTML =
      `<div class="pick-list">
         <button class="pick" id="rcScan"><b>${ic('grid-3x3', 'ic-14')} Scanner</b></button>
         <button class="pick" id="rcFile"><b>${ic('folder', 'ic-14')} Ouvrir un fichier</b><span>.oc</span></button>
         <button class="pick" id="rcPaste"><b>${ic('clipboard', 'ic-14')} Coller</b></button>
       </div>
       <p class="hint">${ic('shield', 'ic-14')} Aperçu avant fusion — annulable.</p>
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
    sh.setFoot(null);
  };

  /* ---- scanner — QR de données (simple ou animé) OU QR de
     rendez-vous : reconnu tout seul ; sans caméra, le code se tape ---- */
  const scan = async () => {
    sh.setTitle('Scanner');
    sh.body.innerHTML =
      `<div class="scan-box"><video id="rcVideo" playsinline muted></video><div class="scan-mark"></div></div>
       <div class="scan-prog" id="rcProg" hidden></div>
       <p class="hint" style="text-align:center" id="rcScanHint">Vise le QR — la lecture est automatique.</p>
       <div class="field" style="margin-top:10px"><label for="rcCode">Ou le code affiché</label>
         <div class="date-row">
           <input id="rcCode" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ex : k7m3p-9xq2f">
           <button class="btn btn-primary" id="rcCodeGo" hidden>OK</button>
         </div></div>`;
    sh.setFoot([btn('← Retour', 'btn-ghost', menu)]);
    const codeInp = q('#rcCode');
    const codeGo = q('#rcCodeGo');
    const goCode = () => { const c = rdvNorm(codeInp.value); if (c) joinRdv(c); };
    codeInp.addEventListener('input', () => { codeGo.hidden = !rdvNorm(codeInp.value); });
    codeInp.addEventListener('keydown', e => { if (e.key === 'Enter') goCode(); });
    codeGo.addEventListener('click', goCode);
    const joiner = makeOCQJoiner();
    try {
      stopScan = await startScan(q('#rcVideo'), raw => {
        const code = rdvParse(raw);
        if (code){ joinRdv(code); return false; }
        const part = joiner(raw);
        if (!part){ halt(); treat(raw); return false; }
        if (part.done){ halt(); treat(part.text); return false; }
        const p = q('#rcProg');
        if (p){ p.hidden = false; p.textContent = `QR animé — reçu ${part.got}/${part.total}, continue de viser`; }
        return true;   /* il manque des parties : on continue */
      });
    } catch (e) {
      const box = q('.scan-box');
      if (box) box.hidden = true;
      const h = q('#rcScanHint');
      if (h) h.textContent = 'Caméra indisponible — tape le code, ou passe par le fichier.';
    }
  };

  /* ---- rendez-vous : l'appairage P2P fait passer les fiches ---- */
  const joinRdv = async code => {
    halt();
    leaveRdv();
    const my = ++gen;
    sh.setTitle('Réception');
    sh.body.innerHTML = `<div class="qr-prog">${ic('clock', 'ic-14')} Connexion…</div>`;
    sh.setFoot([btn('← Retour', 'btn-ghost', menu)]);
    let r;
    try {
      r = await openRoom('give', code);
    } catch (e) {
      if (my !== gen) return;
      toast('Pas de connexion — demande un QR hors ligne ou un fichier.');
      menu();
      return;
    }
    if (my !== gen){ try { r.leave(); } catch (e) {} return; }
    room = r;
    sh.body.innerHTML = `<div class="qr-prog" id="rcRdvSt">${ic('clock', 'ic-14')} En attente de l’autre appareil…</div>`;
    const give = room.makeAction('give');
    let got = false;
    give.onMessage = obj => {
      if (got || !obj || obj.kind !== 'share' || !Array.isArray(obj.companies)) return;
      obj.companies = obj.companies.filter(x => x && typeof x === 'object' && x.name).slice(0, 2000);
      if (!obj.companies.length) return;
      /* même borne que par fichier (D4) : un envoi obèse est ignoré */
      if (JSON.stringify(obj.companies).length > 4000000) return;
      got = true;
      leaveRdv();
      mergePreviewInto(sh, obj, { onCancel: menu });
    };
    room.onPeerJoin = () => {
      const el = q('#rcRdvSt');
      if (el) el.innerHTML = `${ic('radio', 'ic-14')} Relié — réception…`;
    };
  };

  /* ---- coller ---- */
  const paste = () => {
    sh.setTitle('Coller');
    sh.body.innerHTML =
      `<div class="field"><label for="rcTxt">Le texte reçu</label>
         <textarea id="rcTxt" style="min-height:140px" placeholder="Colle ici le contenu partagé"></textarea></div>`;
    sh.setFoot([btn('← Retour', 'btn-ghost', menu), btn('Lire', 'btn-primary', () => treat(q('#rcTxt').value))]);
    q('#rcTxt').focus();
  };

  /* ---- mot de passe (fichiers OC2) ---- */
  const askPass = raw => {
    sh.setTitle('Fichier protégé');
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 10px">${ic('lock', 'ic-14')} Chiffré — demande le mot de passe à l’expéditeur.</p>
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
    mergePreviewInto(sh, obj, { onCancel: menu });
  };

  menu();
}

/* ---- aperçu avant fusion + fusion + annulation — réutilisé par le
   direct (partage en groupe) : mêmes règles, quel que soit le canal ---- */
export function mergePreviewInto(sh, obj, opts){
  opts = opts || {};
  /* fusion à blanc sur une copie : l'aperçu dit tout, rien n'est touché */
  const dry = mergeIncoming(obj.companies, JSON.parse(JSON.stringify(S.companies)));
  const n = obj.companies.length;
  sh.setTitle('Aperçu avant fusion');
  sh.body.innerHTML =
    `<div class="rc-recap">
       ${opts.from ? `<p class="hint" style="margin:0 0 8px">${ic('radio', 'ic-14')} Reçu en direct de <b>${esc(opts.from)}</b></p>` : ''}
       <div class="rc-big">${n} piste${n > 1 ? 's' : ''} reçue${n > 1 ? 's' : ''}</div>
       <ul class="rc-lines">
         <li>${ic('plus', 'ic-14')} <b>${dry.addedC}</b> nouvelle${dry.addedC > 1 ? 's' : ''}</li>
         ${dry.enriched ? `<li>${ic('pencil', 'ic-14')} <b>${dry.enriched}</b> complétée${dry.enriched > 1 ? 's' : ''}</li>` : ''}
         ${dry.addedCt ? `<li>${ic('contact', 'ic-14')} <b>${dry.addedCt}</b> contact${dry.addedCt > 1 ? 's' : ''} ajouté${dry.addedCt > 1 ? 's' : ''}</li>` : ''}
         ${dry.conflicts ? `<li class="rc-warn">${ic('square-alert', 'ic-14')} <b>${dry.conflicts}</b> divergence${dry.conflicts > 1 ? 's' : ''} — l’existant est gardé</li>` : ''}
       </ul>
       ${obj.kind === 'full' ? `<p class="hint">${ic('info-box', 'ic-14')} Sauvegarde complète : seules les pistes fusionnent ici. Pour tout restaurer, passe par « Moi ».</p>` : ''}
       <p class="hint">${ic('shield', 'ic-14')} Rien n’est écrasé, annulable juste après.</p>
     </div>`;
  sh.setFoot([
    btn('Annuler', 'btn-ghost', () => opts.onCancel ? opts.onCancel() : sh.close()),
    btn(dry.addedC + dry.enriched + dry.addedCt === 0 ? 'Rien à ajouter' : 'Fusionner', 'btn-primary', () => {
      const snapshot = JSON.stringify(S.companies);
      const stats = mergeIncoming(obj.companies, S.companies);
      saveData();
      logJ('Reçu' + (opts.from ? ' de ' + opts.from : ' de la promo') + ' : +' + stats.addedC + ' piste(s), ' + stats.enriched + ' complétée(s)');
      sh.close();
      bus.refresh();
      offerUndo(snapshot, stats);
      if (opts.onDone) opts.onDone(stats);
    })
  ]);
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
