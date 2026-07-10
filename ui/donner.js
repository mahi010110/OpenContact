/* ============================================================
   OpenContact — interface · Donner à la promo
   Une feuille guidée, une décision à la fois : quoi → comment
   (QR en personne — animé en plusieurs parties si besoin, sans
   limite pratique de fiches ; ou fichier .oc) → protégé ?
   Le suivi privé ne part jamais : tout passe par sharePayload
   (vue communautaire) ou OCQ1/OCQP — qui l'excluent par
   construction.
   ============================================================ */
import { esc, todayISO } from '../engine/utils.js';
import { STATUSES } from '../engine/model.js';
import { sharePayload, encodeOCQ, splitOCQ } from '../engine/exchange.js';
import { encryptOC2 } from '../engine/crypto.js';
import { S, isClosed, logJ } from './state.js';
import { openSheet, toast, btn, ic } from './dom.js';
import { makeQrSvg } from './qr.js';

const QR_SOFT_MAX = 6;        /* au-delà, le QR s'anime (plusieurs parties) */
const QR_HARD_MAX = 1800;     /* caractères par QR : au-delà, on découpe (OCQP) */

export function openDonner(){
  /* jamais les pistes d'exemple : leurs contacts sont fictifs */
  const alive = S.companies.filter(c => !isClosed(c) && !c.demo)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!alive.length){ toast('Rien à donner pour l’instant — ajoute d’abord une piste.'); return; }
  const sel = new Set(alive.map(c => c.id));
  const sh = openSheet({ title: 'Donner à la promo', icon: 'share' });
  const q = s => sh.body.querySelector(s);
  const chosen = () => alive.filter(c => sel.has(c.id));

  /* ---- étape 1 : quoi ? ---- */
  const stepQuoi = () => {
    sh.setTitle('Donner — quoi ?');
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 10px">${ic('lock', 'ic-14')} Seules les fiches partent — jamais ton suivi privé.</p>
       <button class="linklike" id="dnAll">Tout cocher / décocher</button>
       <div class="pick-list" style="margin-top:8px">
         ${alive.map(c =>
           `<button class="pick pk${sel.has(c.id) ? ' on' : ''}" data-id="${c.id}" aria-pressed="${sel.has(c.id)}">
              ${ic('checkbox', 'ic-20 ic-off')}${ic('checkbox-on', 'ic-20 ic-on')}
              <div class="pk-m"><b>${esc(c.name)}</b>
                <span>${STATUSES[c.status].label}${c.city ? ' · ' + esc(c.city) : ''}</span></div>
            </button>`).join('')}
       </div>`;
    const bNext = btn('Continuer', 'btn-primary', () => { if (sel.size) stepComment(); });
    const sync = () => {
      bNext.textContent = sel.size ? `Continuer (${sel.size})` : 'Continuer';
      bNext.classList.toggle('btn-off', !sel.size);
    };
    sh.body.querySelectorAll('.pk').forEach(b =>
      b.addEventListener('click', () => {
        sel.has(b.dataset.id) ? sel.delete(b.dataset.id) : sel.add(b.dataset.id);
        b.classList.toggle('on', sel.has(b.dataset.id));
        b.setAttribute('aria-pressed', sel.has(b.dataset.id));
        sync();
      }));
    q('#dnAll').addEventListener('click', () => {
      const all = sel.size < alive.length;
      sel.clear();
      if (all) alive.forEach(c => sel.add(c.id));
      sh.body.querySelectorAll('.pk').forEach(b => {
        b.classList.toggle('on', sel.has(b.dataset.id));
        b.setAttribute('aria-pressed', sel.has(b.dataset.id));
      });
      sync();
    });
    sh.setFoot([btn('Annuler', 'btn-ghost', () => sh.close()), bNext]);
    sync();
  };

  /* ---- étape 2 : comment ? ---- */
  const stepComment = () => {
    const n = sel.size;
    sh.setTitle(`Donner ${n} piste${n > 1 ? 's' : ''} — comment ?`);
    sh.body.innerHTML =
      `<div class="pick-list">
         <button class="pick" id="dnQR">
           <b>${ic('grid-3x3', 'ic-14')} QR — en personne</b>
           <span>l’autre téléphone scanne ton écran${n > QR_SOFT_MAX ? ' — QR animé en plusieurs parties' : ''}</span>
         </button>
         <button class="pick" id="dnFile">
           <b>${ic('file', 'ic-14')} Fichier .oc</b>
           <span>partage, téléchargement ou copie — mot de passe possible</span>
         </button>
       </div>`;
    q('#dnQR').addEventListener('click', stepQR);
    q('#dnFile').addEventListener('click', stepFile);
    sh.setFoot([btn('← Retour', 'btn-ghost', stepQuoi)]);
  };

  /* ---- QR (OCQ1) — au-delà d'un QR lisible, il s'anime (OCQP) ---- */
  const stepQR = async () => {
    let compact;
    try {
      compact = await encodeOCQ(chosen());
    } catch (e) {
      toast('Le QR n’est pas disponible sur ce navigateur — passe par le fichier.');
      stepFile();
      return;
    }
    const parts = compact.length > QR_HARD_MAX ? splitOCQ(compact) : [compact];
    const svgs = await Promise.all(parts.map(makeQrSvg));
    sh.setTitle(`QR — ${sel.size} piste${sel.size > 1 ? 's' : ''}`);
    sh.body.innerHTML =
      `<div class="qr-wrap" role="img" aria-label="QR à faire scanner">${svgs[0]}</div>
       ${svgs.length > 1 ? `<div class="qr-prog" id="dnQrProg">partie 1/${svgs.length} — laisse défiler</div>` : ''}
       <p class="hint" style="text-align:center">L’autre personne : <b>Échanger → Recevoir → Scanner</b>${svgs.length > 1 ? ' — son appareil assemble tout seul' : ''}.</p>`;
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
    logJ('Donné (QR) : ' + sel.size + ' piste(s)');
    sh.setFoot([btn('← Retour', 'btn-ghost', stepComment), btn('Fichier plutôt', '', stepFile), btn('Terminé', 'btn-primary', () => sh.close())]);
  };

  /* ---- fichier .oc : mot de passe optionnel, 3 sorties ---- */
  const stepFile = () => {
    const n = sel.size;
    sh.setTitle(`Fichier .oc — ${n} piste${n > 1 ? 's' : ''}`);
    sh.body.innerHTML =
      `<div class="field"><label for="dnPass">Mot de passe <span class="lbl-soft">— optionnel</span></label>
         <input id="dnPass" type="password" placeholder="Vide = lisible par tous" autocomplete="new-password">
         <p class="hint">Chiffré si tu en mets un — perdu = irrécupérable.</p></div>
       <div class="pick-list">
         ${navigator.share ? `<button class="pick" id="dnShare"><b>${ic('share', 'ic-14')} Partager</b><span>WhatsApp, mail…</span></button>` : ''}
         <button class="pick" id="dnDl"><b>${ic('download', 'ic-14')} Télécharger</b><span>opencontact-pistes-${todayISO()}.oc</span></button>
         <button class="pick" id="dnCopy"><b>${ic('copy', 'ic-14')} Copier le texte</b><span>à coller où tu veux</span></button>
       </div>`;
    const make = async () => {
      const payload = sharePayload(chosen());
      const pass = q('#dnPass').value;
      const txt = pass ? await encryptOC2(payload, pass) : JSON.stringify(payload);
      logJ('Donné (fichier' + (pass ? ' chiffré' : '') + ') : ' + n + ' piste(s)');
      return txt;
    };
    const fname = 'opencontact-pistes-' + todayISO() + '.oc';
    const share = q('#dnShare');
    if (share) share.addEventListener('click', async () => {
      const txt = await make();
      const file = new File([txt], fname, { type: 'application/octet-stream' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Pistes OpenContact' });
        else await navigator.share({ title: 'Pistes OpenContact', text: txt });
        toast('Parti ✓');
      } catch (e) { /* partage annulé : pas une erreur */ }
    });
    q('#dnDl').addEventListener('click', async () => {
      const txt = await make();
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
      try { await navigator.clipboard.writeText(txt); toast('Copié — colle-le où tu veux.'); }
      catch (e) { toast('Copie impossible ici — passe par Télécharger.'); }
    });
    sh.setFoot([btn('← Retour', 'btn-ghost', stepComment), btn('Terminé', 'btn-primary', () => sh.close())]);
  };

  stepQuoi();
}
