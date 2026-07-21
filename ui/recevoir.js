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
import { openRoom, watchLiaison, deviceSelf, ensureKeys } from './synclive.js';
import { startScan } from './qr.js';
import { probeCompanion, companionCall } from '../engine/companion.js';
import { makeMission, signMission } from '../engine/mission.js';
import { loadCompanion } from './compagnon.js';
import { requireCode } from './verrou.js';
import { mailAnalysis, beginMailAnalysis, markMailAnalysisRunning,
         failMailAnalysis, clearMailAnalysis, reconcileMailAnalysis,
         subscribeMailAnalysis } from './analyse.js';

export function openRecevoir(){
  let stopScan = null;
  let stopAnalysis = null;
  let room = null;         /* salle de rendez-vous (QR OCR1 / code tapé) */
  let rdvWatch = null;     /* honnêteté de la liaison du rendez-vous */
  let gen = 0;
  const halt = () => { if (stopScan){ stopScan(); stopScan = null; } };
  const leaveAnalysis = () => { if (stopAnalysis){ stopAnalysis(); stopAnalysis = null; } };
  const leaveRdv = () => {
    if (rdvWatch){ rdvWatch.stop(); rdvWatch = null; }
    if (room){ try { room.leave(); } catch (e) {} room = null; }
  };
  /* caméra et salle se coupent quelle que soit la façon de fermer */
  const sh = openSheet({ title: 'Recevoir', icon: 'inbox', onClose: () => { gen++; halt(); leaveAnalysis(); leaveRdv(); } });
  const q = s => sh.body.querySelector(s);

  const menu = () => {
    gen++;
    halt();
    leaveAnalysis();
    leaveRdv();
    sh.setTitle('Recevoir');
    sh.body.innerHTML =
      `<div class="pick-list">
         <button class="pick" id="rcScan"><b>${ic('grid-3x3', 'ic-14')} Scanner</b></button>
         <button class="pick" id="rcFile"><b>${ic('folder', 'ic-14')} Ouvrir un fichier</b><span>.oc</span></button>
         <button class="pick" id="rcPaste"><b>${ic('clipboard', 'ic-14')} Coller</b></button>
         <button class="pick" id="rcMails"><b>${ic('sparkles', 'ic-14')} Depuis mes e-mails</b><span>l’IA propose, tu tries</span></button>
       </div>
       <p class="hint">${ic('shield', 'ic-14')} Aperçu avant fusion — annulable.</p>
       <input type="file" id="rcInput" accept=".oc,.txt,.json,application/octet-stream,text/plain,application/json" hidden>`;
    q('#rcScan').addEventListener('click', scan);
    q('#rcFile').addEventListener('click', () => q('#rcInput').click());
    q('#rcPaste').addEventListener('click', paste);
    q('#rcMails').addEventListener('click', mails);
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
    let joined = false;
    /* l'étape prouvée, pas une attente muette : relais morts ou liaison
       directe en échec se DISENT, avec le repli (QR hors ligne, fichier) */
    const w = watchLiaison(() => joined ? 1 : 0, stage => {
      if (my !== gen || joined) return;
      const el = q('#rcRdvSt');
      if (!el) return;
      if (stage === 'norelay')
        el.innerHTML = `${ic('square-alert', 'ic-14')} Aucun relais joignable — demande un QR hors ligne ou un fichier.`;
      else if (stage === 'rtcfail')
        el.innerHTML = `${ic('square-alert', 'ic-14')} L’autre appareil est en vue, mais la liaison échoue — passe par le QR hors ligne ou le fichier.`;
      else if (stage === 'wait')
        el.innerHTML = `${ic('clock', 'ic-14')} En attente de l’autre appareil…`;
      else
        el.innerHTML = `${ic('clock', 'ic-14')} Connexion aux relais…`;
    });
    try {
      r = await openRoom('give', code, { onJoinError: () => w.fail() });
    } catch (e) {
      w.stop();
      if (my !== gen) return;
      toast('Pas de connexion — demande un QR hors ligne ou un fichier.');
      menu();
      return;
    }
    if (my !== gen){ w.stop(); try { r.leave(); } catch (e) {} return; }
    room = r;
    rdvWatch = w;
    sh.body.innerHTML = `<div class="qr-prog" id="rcRdvSt">${ic('clock', 'ic-14')} Connexion aux relais…</div>`;
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
      joined = true;
      const el = q('#rcRdvSt');
      if (el) el.innerHTML = `${ic('radio', 'ic-14')} Relié — réception…`;
    };
  };

  /* ---- depuis mes e-mails : l'IA lit chez toi, propose ici ----
     Le prompt guidé reste le repli. Avec le Compagnon, la mission est
     mémorisée avant son départ : fermer cette feuille ou l'app ne la
     perd plus, et le résultat revient dans le même aperçu triable. */
  const mails = async () => {
    const view = ++gen;
    leaveAnalysis();
    sh.setTitle('Depuis mes e-mails');
    const prompt = (S.profile.prompts.find(p => /mails?|e-?mails?/i.test(p.name)) || S.profile.prompts[0]);
    const assoc = await loadCompanion().catch(() => null);
    if (view !== gen || !sh.body.isConnected) return;
    const pending = mailAnalysis();
    const pendingPick = pending ? (pending.state === 'ready'
      ? `<button class="pick" id="rcLastAnalysis"><b>${ic('sparkles', 'ic-14')} La dernière analyse</b>
           <span>${pending.count} piste${pending.count > 1 ? 's' : ''} proposée${pending.count > 1 ? 's' : ''} à trier</span></button>`
      : (pending.state === 'error'
        ? `<button class="pick" id="rcAnalysisError"><b>${ic('square-alert', 'ic-14')} La dernière analyse s’est arrêtée</b>
             <span>voir le détail ou recommencer</span></button>`
        : `<button class="pick" id="rcCurrentAnalysis"><b>${ic('clock', 'ic-14')} Analyse en cours</b>
             <span>ton ordinateur continue même si tu fermes cette fenêtre</span></button>`)) : '';
    sh.body.innerHTML =
      `${pendingPick ? `<div class="pick-list">${pendingPick}</div>` : ''}
       ${assoc ? `
       <div class="pick-list">
         <button class="pick" id="rcScan7"><b>${ic('zap', 'ic-14')} Ton ordinateur lit tes 7 derniers jours</b>
           <span>l’IA lit chez toi, propose ici — annulable</span></button>
         <button class="pick" id="rcScan30"><b>${ic('zap', 'ic-14')} Les 30 derniers jours</b>
           <span>plus long, plus complet</span></button>
       </div>
       <p class="hint">${ic('shield', 'ic-14')} Rien ne s’enregistre sans ton accord — chaque proposition se trie.</p>
       <div class="lbl-row" style="margin:12px 0 6px"><label>ou à la main</label></div>` : ''}
       <div class="pick-list">
         <div class="lk-why">${ic('copy', 'ic-14')} <span>Copie le prompt, colle-le dans ton assistant IA avec tes e-mails.</span></div>
         <div class="lk-why">${ic('clipboard', 'ic-14')} <span>Rapporte ici sa réponse : chaque piste proposée se coche ou s’écarte.</span></div>
         ${assoc ? '' : `<div class="lk-why">${ic('shield', 'ic-14')} <span>Rien ne s’enregistre sans ton accord.</span></div>`}
       </div>
       ${assoc ? '' : `<p class="hint">${ic('lightbulb', 'ic-14')} ${matchMedia('(min-width:901px)').matches
         ? 'Avec le Compagnon, ton ordinateur fait la lecture tout seul — Moi → Mes appareils.'
         : 'Le Compagnon s’installe et s’associe depuis ton ordinateur — ouvre OpenContact là-bas.'}</p>`}
       <div class="field" style="margin-top:10px"><label for="rcMailTxt">La réponse de l’IA</label>
         <textarea id="rcMailTxt" style="min-height:120px" placeholder="Colle ici le texte produit par l’assistant"></textarea></div>`;
    q('#rcLastAnalysis')?.addEventListener('click', showReady);
    q('#rcCurrentAnalysis')?.addEventListener('click', () => showProgress(pending.mid));
    q('#rcAnalysisError')?.addEventListener('click', showError);
    q('#rcScan7')?.addEventListener('click', () => scan(7));
    q('#rcScan30')?.addEventListener('click', () => scan(30));
    sh.setFoot([
      btn('← Retour', 'btn-ghost', menu),
      btn('Copier le prompt', '', async () => {
        try { await navigator.clipboard.writeText(prompt.text); toast('Prompt copié — colle-le dans ton assistant.'); }
        catch (e) { toast('Copie impossible ici — retrouve-le dans Moi → Coup de pouce IA.'); }
      }, 'copy'),
      btn('Lire', 'btn-primary', () => treat(q('#rcMailTxt').value, undefined, { select: true }))
    ]);
    if (pending && (pending.state === 'sending' || pending.state === 'running'))
      reconcileMailAnalysis().catch(() => {});

    async function showReady(){
      const rec = mailAnalysis();
      if (!rec || rec.state !== 'ready'){ mails(); return; }
      gen++;
      leaveAnalysis();
      await mergeReadyAnalysisInto(sh, mails);
    }

    function showError(){
      const rec = mailAnalysis();
      if (!rec || rec.state !== 'error'){ mails(); return; }
      gen++;
      leaveAnalysis();
      sh.setTitle('Analyse interrompue');
      sh.body.innerHTML =
        `<p class="hint warn" style="margin:8px 0 12px">${ic('square-alert', 'ic-14')} ${esc(rec.error)}</p>
         <p class="hint">Aucune piste n’a été ajoutée. Tu peux oublier ce résultat puis relancer une lecture.</p>`;
      sh.setFoot([
        btn('← Retour', 'btn-ghost', mails),
        btn('Oublier et recommencer', 'btn-primary', async () => { await clearMailAnalysis(rec.mid); mails(); })
      ]);
    }

    function showProgress(mid){
      const mine = ++gen;
      leaveAnalysis();
      sh.setTitle('Lecture en cours');
      sh.body.innerHTML =
        `<p class="hint" style="margin:12px 0">${ic('zap', 'ic-14')} Ton ordinateur lit tes e-mails
           et l’IA locale prépare des propositions.</p>
         <p class="hint" id="rcScanSt">Tu peux fermer : le résultat reviendra dans Aujourd’hui.</p>`;
      const cancel = async () => {
        const rec = mailAnalysis();
        if (!rec || rec.mid !== mid){ mails(); return; }
        const st = q('#rcScanSt');
        if (st) st.textContent = 'Annulation auprès de ton ordinateur…';
        const assoc2 = await loadCompanion().catch(() => null);
        const found = assoc2 && await probeCompanion();
        if (!found){
          if (st) st.textContent = 'Ton ordinateur ne répond pas : ouvre le Compagnon pour confirmer l’annulation.';
          return;
        }
        try {
          const rep = await companionCall(found.base, assoc2.k, { t: 'revoquer', mid });
          if (!rep || rep.t !== 'ok') throw new Error('revoquer');
          await clearMailAnalysis(mid);
          toast('Analyse annulée — aucune proposition conservée.');
          mails();
        } catch (e) {
          if (st) st.textContent = 'Annulation non confirmée — réessaie quand le Compagnon répond.';
        }
      };
      sh.setFoot([btn('Annuler l’analyse', 'btn-ghost', cancel)]);
      stopAnalysis = subscribeMailAnalysis(rec => {
        if (mine !== gen || !sh.body.isConnected || !rec || rec.mid !== mid) return;
        if (rec.state === 'ready') showReady();
        else if (rec.state === 'error') showError();
      });
      reconcileMailAnalysis().catch(() => {});
    }

    /* Mission bornée, visible, annulable. Sa trace est écrite avant le
       réseau pour fermer la petite course « accepté puis app fermée ». */
    async function scan(jours){
      const old = mailAnalysis();
      if (old){
        if (old.state === 'ready') showReady();
        else if (old.state === 'error') showError();
        else showProgress(old.mid);
        return;
      }
      const assoc2 = await loadCompanion().catch(() => null);
      if (!assoc2) return;
      if (!await requireCode('Ton code, pour lancer la lecture')) return;
      const found = await probeCompanion();
      if (!found){ toast('Ton ordinateur est éteint — ouvre le Compagnon d’abord.'); return; }
      try {
        const self = await deviceSelf();
        const keys = await ensureKeys();
        const m = makeMission('mail-scan', { jours, prompt: prompt.text });
        const wire = await signMission(m, self.id, keys.seed);
        await beginMailAnalysis({
          mid: m.mid, days: jours, startedAt: m.createdAt, expiresAt: m.expiresAt
        });
        showProgress(m.mid);
        let rep;
        try { rep = await companionCall(found.base, assoc2.k, { t: 'mission', wire }); }
        catch (e) {
          /* Le paquet a pu être accepté avant la coupure : garder le mid
             et laisser la réconciliation trancher, plutôt que le perdre. */
          await markMailAnalysisRunning(m.mid);
          toast('Connexion interrompue — ton ordinateur peut continuer, le résultat reste suivi.');
          return;
        }
        if (!rep || rep.t !== 'mission-ok'){
          await failMailAnalysis(m.mid, 'Le Compagnon a refusé cette analyse.');
          return;
        }
        await markMailAnalysisRunning(m.mid);
        reconcileMailAnalysis().catch(() => {});
      } catch (err) {
        const msg = err && err.message === 'stockage'
          ? 'Impossible de mémoriser cette analyse : vérifie le stockage avant de réessayer.'
          : 'Impossible de lancer l’analyse — ' + (err && err.message || 'réessaie.');
        toast(msg);
        if (sh.body.isConnected) mails();
      }
    }
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
  const treat = async (raw, pass, extra) => {
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
    mergePreviewInto(sh, obj, Object.assign({ onCancel: menu }, extra || {}));
  };

  menu();
}

/* Ouverture directe depuis le chip d'Aujourd'hui. Annuler ferme seulement
   l'aperçu : la proposition reste disponible jusqu'à fusion ou abandon
   explicite dans « Depuis mes e-mails ». */
export async function openPendingMailAnalysis(){
  const rec = mailAnalysis();
  if (!rec || rec.state !== 'ready'){ toast('Aucune analyse prête à trier.'); return; }
  const sh = openSheet({ title: 'Propositions de l’analyse', icon: 'sparkles' });
  sh.body.innerHTML = `<p class="hint">${ic('clock', 'ic-14')} Ouverture du résultat…</p>`;
  await mergeReadyAnalysisInto(sh, () => sh.close());
}

async function mergeReadyAnalysisInto(sh, onCancel){
  const rec = mailAnalysis();
  if (!rec || rec.state !== 'ready'){ if (onCancel) onCancel(); return; }
  let obj;
  try { obj = await parseInput(rec.result); }
  catch (e) {
    await failMailAnalysis(rec.mid, 'Le résultat mémorisé est devenu illisible.');
    toast('Ce résultat ne peut plus être lu.');
    if (onCancel) onCancel();
    return;
  }
  mergePreviewInto(sh, obj, {
    select: true,
    onCancel,
    onDone: () => { clearMailAnalysis(rec.mid).catch(() => {}); }
  });
}

/* ---- aperçu avant fusion + fusion + annulation — réutilisé par le
   direct (partage en groupe) : mêmes règles, quel que soit le canal ---- */
export function mergePreviewInto(sh, obj, opts){
  opts = opts || {};
  /* fusion à blanc sur une copie : l'aperçu dit tout, rien n'est touché */
  const dry = mergeIncoming(obj.companies, JSON.parse(JSON.stringify(S.companies)));
  const n = obj.companies.length;
  /* une proposition d'IA se TRIE (opts.select) — un partage de
     camarade se prend en bloc : mêmes règles de fusion ensuite */
  const unsel = new Set();
  sh.setTitle('Aperçu avant fusion');
  sh.body.innerHTML =
    `<div class="rc-recap">
       ${opts.from ? `<p class="hint" style="margin:0 0 8px">${ic('radio', 'ic-14')} Reçu en direct de <b>${esc(opts.from)}</b></p>` : ''}
       <div class="rc-big">${n} piste${n > 1 ? 's' : ''} ${opts.select ? 'proposée' : 'reçue'}${n > 1 ? 's' : ''}</div>
       <ul class="rc-lines">
         <li>${ic('plus', 'ic-14')} <b>${dry.addedC}</b> nouvelle${dry.addedC > 1 ? 's' : ''}</li>
         ${dry.enriched ? `<li>${ic('pencil', 'ic-14')} <b>${dry.enriched}</b> complétée${dry.enriched > 1 ? 's' : ''}</li>` : ''}
         ${dry.addedCt ? `<li>${ic('contact', 'ic-14')} <b>${dry.addedCt}</b> contact${dry.addedCt > 1 ? 's' : ''} ajouté${dry.addedCt > 1 ? 's' : ''}</li>` : ''}
         ${dry.conflicts ? `<li class="rc-warn">${ic('square-alert', 'ic-14')} <b>${dry.conflicts}</b> divergence${dry.conflicts > 1 ? 's' : ''} — l’existant est gardé</li>` : ''}
       </ul>
       ${obj.kind === 'full' ? `<p class="hint">${ic('info-box', 'ic-14')} Sauvegarde complète : seules les pistes fusionnent ici. Pour tout restaurer, passe par « Moi ».</p>` : ''}
       ${opts.select && n ? `<div class="pick-list" style="margin:10px 0 4px">
         ${obj.companies.slice(0, 200).map((c, i) =>
           `<button class="pick pk on" data-sel="${i}" aria-pressed="true">
              ${ic('checkbox', 'ic-20 ic-off')}${ic('checkbox-on', 'ic-20 ic-on')}
              <div class="pk-m"><b>${esc(c.name || '')}</b>
                <span>${esc([c.city, (c.contacts || []).length ? (c.contacts.length + ' contact' + (c.contacts.length > 1 ? 's' : '')) : ''].filter(Boolean).join(' · '))}</span></div>
            </button>`).join('')}
       </div>` : ''}
       <p class="hint">${ic('shield', 'ic-14')} Rien n’est écrasé, annulable juste après.</p>
       ${opts.onDiscard ? `<button class="linklike" id="rcDiscard">Écarter ces propositions</button>` : ''}
     </div>`;
  const bGo = btn(dry.addedC + dry.enriched + dry.addedCt === 0 ? 'Rien à ajouter' : 'Fusionner', 'btn-primary', () => {
    const chosen = opts.select ? obj.companies.filter((_, i) => !unsel.has(i)) : obj.companies;
    if (!chosen.length){ toast('Tout est décoché — rien à fusionner.'); return; }
    const snapshot = JSON.stringify(S.companies);
    const stats = mergeIncoming(chosen, S.companies);
    saveData();
    logJ('Reçu' + (opts.from ? ' de ' + opts.from : (opts.select ? ' (analyse IA triée)' : ' de la promo')) + ' : +' + stats.addedC + ' piste(s), ' + stats.enriched + ' complétée(s)');
    sh.close();
    bus.refresh();
    offerUndo(snapshot, stats);
    if (opts.onDone) opts.onDone(stats);
  });
  const relabel = () => {
    if (!opts.select) return;
    const kept = n - unsel.size;
    bGo.textContent = kept ? `Fusionner (${kept})` : 'Rien de coché';
  };
  sh.body.querySelectorAll('[data-sel]').forEach(b =>
    b.addEventListener('click', () => {
      const i = +b.dataset.sel;
      unsel.has(i) ? unsel.delete(i) : unsel.add(i);
      b.classList.toggle('on', !unsel.has(i));
      b.setAttribute('aria-pressed', String(!unsel.has(i)));
      relabel();
    }));
  relabel();
  sh.body.querySelector('#rcDiscard')?.addEventListener('click', () => opts.onDiscard());
  sh.setFoot([
    btn('Annuler', 'btn-ghost', () => opts.onCancel ? opts.onCancel() : sh.close()),
    bGo
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
