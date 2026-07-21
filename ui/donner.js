/* ============================================================
   OpenContact — interface · Donner à la promo
   Une feuille, une décision : QR (en personne) ou fichier .oc
   (à distance, chiffrable d'une case). Tout part par défaut —
   élagable d'un tap, triable comme partout. Le suivi privé ne
   part jamais : tout passe par sharePayload (vue communautaire)
   ou OCQ1/OCQP — qui l'excluent par construction.
   ============================================================ */
import { esc, todayISO } from '../engine/utils.js';
import { STATUSES } from '../engine/model.js';
import { sharePayload, encodeOCQ, splitOCQ, makeRdvCode, rdvNorm, rdvWrap } from '../engine/exchange.js';
import { filterCompanies } from '../engine/filter.js';
import { encryptOC2 } from '../engine/crypto.js';
import { S, isClosed, logJ } from './state.js';
import { openSheet, toast, btn, ic } from './dom.js';
import { sortState, sortArgs, sortBarHTML, bindSortBar } from './sort.js';
import { openRoom, watchLiaison } from './synclive.js';
import { makeQrSvg } from './qr.js';

const QR_HARD_MAX = 1800;     /* caractères par QR : au-delà, rendez-vous P2P ou QR animé */

export function openDonner(){
  /* jamais les pistes d'exemple : leurs contacts sont fictifs */
  const alive = () => S.companies.filter(c => !isClosed(c) && !c.demo);
  if (!alive().length){ toast('Rien à donner pour l’instant — ajoute d’abord une piste.'); return; }
  const unsel = new Set();
  const st = sortState('recent');
  let choosing = false;
  const chosen = () => alive().filter(c => !unsel.has(c.id));
  /* salle de rendez-vous éventuelle : fermée à chaque changement d'écran */
  let room = null;
  let rdvWatch = null;     /* honnêteté de la liaison du rendez-vous */
  let gen = 0;
  const leaveRdv = () => {
    if (rdvWatch){ rdvWatch.stop(); rdvWatch = null; }
    if (room){ try { room.leave(); } catch (e) {} room = null; }
  };
  const enter = () => { gen++; leaveRdv(); return gen; };
  const sh = openSheet({ title: 'Donner', icon: 'share', onClose: () => { gen++; leaveRdv(); } });
  const q = s => sh.body.querySelector(s);

  /* ---- l'écran : QR ou fichier — tout part par défaut, élagable ---- */
  const stepHow = () => {
    enter();
    sh.setTitle('Donner');
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 10px">${ic('lock', 'ic-14')} Seules les fiches partent — jamais ton suivi privé.</p>
       <div class="pick-list">
         <button class="pick" id="dnQR"><b>${ic('grid-3x3', 'ic-14')} QR</b><span>en personne</span></button>
         <button class="pick" id="dnFile"><b>${ic('file', 'ic-14')} Fichier .oc</b><span>à distance</span></button>
       </div>
       <div class="dn-what">
         <span class="dn-count" id="dnCount"></span>
         <button class="linklike" id="dnPick"></button>
       </div>
       <div id="dnList" hidden></div>`;
    const syncCount = () => {
      const k = chosen().length;
      const t = alive().length;
      q('#dnCount').textContent = (k === t ? k : k + ' / ' + t) + ' piste' + (t > 1 ? 's' : '');
      q('#dnPick').textContent = choosing ? 'Replier' : 'Choisir…';
    };
    const renderList = () => {
      const zone = q('#dnList');
      if (!choosing){ zone.hidden = true; zone.innerHTML = ''; syncCount(); return; }
      const list = filterCompanies(alive(), sortArgs(st));
      zone.hidden = false;
      zone.innerHTML =
        `<div class="listbar"><button class="linklike" id="dnAll">Tout cocher / décocher</button>${sortBarHTML(st)}</div>
         <div class="pick-list">
           ${list.map(c =>
             `<button class="pick pk${unsel.has(c.id) ? '' : ' on'}" data-id="${c.id}" aria-pressed="${!unsel.has(c.id)}">
                ${ic('checkbox', 'ic-20 ic-off')}${ic('checkbox-on', 'ic-20 ic-on')}
                <div class="pk-m"><b>${esc(c.name)}</b>
                  <span>${STATUSES[c.status].label}${c.city ? ' · ' + esc(c.city) : ''}</span></div>
              </button>`).join('')}
         </div>`;
      bindSortBar(zone, st, renderList);
      zone.querySelectorAll('.pk').forEach(b =>
        b.addEventListener('click', () => {
          const id = b.dataset.id;
          unsel.has(id) ? unsel.delete(id) : unsel.add(id);
          b.classList.toggle('on', !unsel.has(id));
          b.setAttribute('aria-pressed', !unsel.has(id));
          syncCount();
        }));
      zone.querySelector('#dnAll').addEventListener('click', () => {
        const all = unsel.size > 0;
        unsel.clear();
        if (!all) alive().forEach(c => unsel.add(c.id));
        renderList();
      });
      syncCount();
    };
    q('#dnPick').addEventListener('click', () => { choosing = !choosing; renderList(); });
    const need = fn => () => { if (!chosen().length){ toast('Coche au moins une piste.'); return; } fn(); };
    q('#dnQR').addEventListener('click', need(stepQR));
    q('#dnFile').addEventListener('click', need(stepFile));
    sh.setFoot(null);
    renderList();
    syncCount();
  };

  /* ---- QR : petit lot → QR de données (hors ligne, un scan) ;
     gros lot → rendez-vous P2P, repli QR animé — tout seul ---- */
  const stepQR = async () => {
    const my = enter();
    const n = chosen().length;
    let compact = null;
    try { compact = await encodeOCQ(chosen()); } catch (e) {}
    if (my !== gen) return;
    if (compact && compact.length <= QR_HARD_MAX){ stepQRData(compact, n); return; }
    if (navigator.onLine){ stepQRRdv(compact, n); return; }
    if (compact){ stepQRData(compact, n); return; }
    toast('Le QR n’est pas disponible sur ce navigateur — passe par le fichier.');
    stepFile();
  };

  /* le QR porte les données (OCQ1) — animé en plusieurs parties si besoin */
  const stepQRData = async (compact, n) => {
    const my = enter();
    const parts = compact.length > QR_HARD_MAX ? splitOCQ(compact) : [compact];
    let svgs;
    try {
      svgs = await Promise.all(parts.map(makeQrSvg));
    } catch (e) {
      /* générateur indisponible : un écran bloqué sans un mot n'est
         pas une réponse — le fichier marche toujours */
      if (my !== gen) return;
      toast('Le QR n’est pas disponible ici — passe par le fichier.');
      stepFile();
      return;
    }
    if (my !== gen) return;
    sh.setTitle(`QR — ${n} piste${n > 1 ? 's' : ''}`);
    sh.body.innerHTML =
      `<div class="qr-wrap" role="img" aria-label="QR à faire scanner">${svgs[0]}</div>
       ${svgs.length > 1 ? `<div class="qr-prog" id="dnQrProg">partie 1/${svgs.length} — laisse défiler</div>` : ''}
       <p class="hint" style="text-align:center">L’autre personne : <b>Échanger → Recevoir → Scanner</b>.</p>`;
    if (svgs.length > 1){
      let i = 0;
      const t = setInterval(() => {
        const wrap = q('.qr-wrap'), prog = q('#dnQrProg');
        if (!wrap || !document.body.contains(wrap)){ clearInterval(t); return; }   /* étape quittée */
        i = (i + 1) % svgs.length;
        wrap.innerHTML = svgs[i];
        prog.textContent = `partie ${i + 1}/${svgs.length} — laisse défiler`;
      }, 900);
    }
    logJ('Donné (QR) : ' + n + ' piste(s)');
    sh.setFoot([btn('← Retour', 'btn-ghost', stepHow), btn('Fichier plutôt', '', stepFile)]);
  };

  /* le QR est un code de rendez-vous (OCR1) : l'autre appareil scanne
     ou tape le code, l'appairage P2P fait passer les fiches — sans
     limite de nombre. Échec de connexion = repli silencieux. */
  const stepQRRdv = async (compact, n) => {
    const my = enter();
    const fallback = () => {
      if (compact){ toast('Pas de connexion — QR hors ligne.'); stepQRData(compact, n); }
      else { toast('Pas de connexion — passe par le fichier.'); stepFile(); }
    };
    sh.setTitle(`QR — ${n} piste${n > 1 ? 's' : ''}`);
    sh.body.innerHTML = `<div class="qr-prog">${ic('clock', 'ic-14')} Connexion…</div>`;
    sh.setFoot([btn('← Retour', 'btn-ghost', stepHow)]);
    const code = makeRdvCode();
    let r, svg;
    let sent = 0;
    /* l'attente dit l'étape prouvée — relais morts ou liaison directe
       en échec basculent d'eux-mêmes vers le repli affiché */
    const w = watchLiaison(() => sent, stage => {
      if (my !== gen || sent) return;
      const el = q('#dnRdvSt');
      if (!el) return;
      if (stage === 'norelay')
        el.innerHTML = `${ic('square-alert', 'ic-14')} Aucun relais joignable — passe par le QR hors ligne ci-dessous.`;
      else if (stage === 'rtcfail')
        el.innerHTML = `${ic('square-alert', 'ic-14')} L’autre appareil est en vue, mais la liaison échoue — QR hors ligne ci-dessous.`;
      else if (stage === 'wait')
        el.innerHTML = `${ic('clock', 'ic-14')} En attente de l’autre appareil…`;
      else
        el.innerHTML = `${ic('clock', 'ic-14')} Connexion aux relais…`;
    });
    try {
      [r, svg] = await Promise.all([openRoom('give', rdvNorm(code), { onJoinError: () => w.fail() }),
        makeQrSvg(rdvWrap(code))]);
    } catch (e) {
      w.stop();
      if (my === gen) fallback();
      return;
    }
    if (my !== gen){ w.stop(); try { r.leave(); } catch (e) {} return; }
    room = r;
    rdvWatch = w;
    sh.body.innerHTML =
      `<div class="qr-wrap" role="img" aria-label="QR de rendez-vous">${svg}</div>
       <div class="sy-phrase"><span>${esc(code)}</span></div>
       <div class="qr-prog" id="dnRdvSt">${ic('clock', 'ic-14')} Connexion aux relais…</div>
       <p class="hint" style="text-align:center">L’autre personne : <b>Recevoir → Scanner</b> — ou tape ce code.</p>
       <button class="linklike" id="dnOffline" style="display:flex;margin:6px auto 0">Sans réseau ? QR hors ligne</button>`;
    q('#dnOffline').addEventListener('click', fallback);
    const give = room.makeAction('give');
    const payload = sharePayload(chosen());
    room.onPeerJoin = () => {
      give.send(payload);
      sent++;
      if (sent === 1) logJ('Donné (QR rendez-vous) : ' + n + ' piste(s)');
      const el = q('#dnRdvSt');
      if (el) el.innerHTML = `${ic('check', 'ic-14')} Envoyé ✓ — ${sent} appareil${sent > 1 ? 's' : ''}`;
    };
  };

  /* ---- fichier .oc : case « Chiffrer », 3 sorties ---- */
  const stepFile = () => {
    enter();
    const n = chosen().length;
    const fname = 'opencontact-pistes-' + todayISO() + '.oc';
    sh.setTitle(`Fichier — ${n} piste${n > 1 ? 's' : ''}`);
    sh.body.innerHTML =
      `<div class="pick-list">
         ${navigator.share ? `<button class="pick" id="dnShare"><b>${ic('share', 'ic-14')} Partager</b><span>WhatsApp, mail…</span></button>` : ''}
         <button class="pick" id="dnDl"><b>${ic('download', 'ic-14')} Télécharger</b><span>${fname}</span></button>
         <button class="pick" id="dnCopy"><b>${ic('copy', 'ic-14')} Copier</b><span>à coller où tu veux</span></button>
       </div>
       <label class="ckline" style="margin-top:12px"><input type="checkbox" id="dnCrypt"> Chiffrer</label>
       <div class="field" id="dnPassF" hidden>
         <label for="dnPass">Mot de passe</label>
         <input id="dnPass" type="password" autocomplete="new-password">
         <p class="hint">Perdu = irrécupérable.</p>
       </div>`;
    q('#dnCrypt').addEventListener('change', e => {
      q('#dnPassF').hidden = !e.target.checked;
      if (e.target.checked) q('#dnPass').focus();
    });
    const make = async () => {
      const crypt = q('#dnCrypt').checked;
      const pass = crypt ? q('#dnPass').value : '';
      if (crypt && !pass){
        toast('Choisis un mot de passe — ou décoche « Chiffrer ».');
        q('#dnPass').focus();
        return null;
      }
      const payload = sharePayload(chosen());
      const txt = pass ? await encryptOC2(payload, pass) : JSON.stringify(payload);
      logJ('Donné (fichier' + (pass ? ' chiffré' : '') + ') : ' + n + ' piste(s)');
      return txt;
    };
    const share = q('#dnShare');
    if (share) share.addEventListener('click', async () => {
      const txt = await make();
      if (txt == null) return;
      const file = new File([txt], fname, { type: 'application/octet-stream' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Pistes OpenContact' });
        else await navigator.share({ title: 'Pistes OpenContact', text: txt });
        toast('Parti ✓');
      } catch (e) { /* partage annulé : pas une erreur */ }
    });
    q('#dnDl').addEventListener('click', async () => {
      const txt = await make();
      if (txt == null) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([txt], { type: 'application/octet-stream' }));
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Fichier téléchargé ✓');
    });
    q('#dnCopy').addEventListener('click', async () => {
      const txt = await make();
      if (txt == null) return;
      try { await navigator.clipboard.writeText(txt); toast('Copié — colle-le où tu veux.'); }
      catch (e) { toast('Copie impossible ici — passe par Télécharger.'); }
    });
    sh.setFoot([btn('← Retour', 'btn-ghost', stepHow)]);
  };

  stepHow();
}
