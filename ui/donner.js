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
import { sharePayload, encodeOCQ, splitOCQ } from '../engine/exchange.js';
import { filterCompanies } from '../engine/filter.js';
import { encryptOC2 } from '../engine/crypto.js';
import { S, isClosed, logJ } from './state.js';
import { openSheet, toast, btn, ic } from './dom.js';
import { sortState, sortBarHTML, bindSortBar } from './sort.js';
import { makeQrSvg } from './qr.js';

const QR_HARD_MAX = 1800;     /* caractères par QR : au-delà, on découpe (OCQP) */

export function openDonner(){
  /* jamais les pistes d'exemple : leurs contacts sont fictifs */
  const alive = () => S.companies.filter(c => !isClosed(c) && !c.demo);
  if (!alive().length){ toast('Rien à donner pour l’instant — ajoute d’abord une piste.'); return; }
  const unsel = new Set();
  const st = sortState('recent');
  let choosing = false;
  const chosen = () => alive().filter(c => !unsel.has(c.id));
  const sh = openSheet({ title: 'Donner', icon: 'share' });
  const q = s => sh.body.querySelector(s);

  /* ---- l'écran : QR ou fichier — tout part par défaut, élagable ---- */
  const stepHow = () => {
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
      const list = filterCompanies(alive(), { sort: st.sort, dir: st.dir, userPos: st.userPos });
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
    sh.setFoot([btn('Fermer', 'btn-ghost', () => sh.close())]);
    renderList();
    syncCount();
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
    const n = chosen().length;
    const parts = compact.length > QR_HARD_MAX ? splitOCQ(compact) : [compact];
    const svgs = await Promise.all(parts.map(makeQrSvg));
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
    sh.setFoot([btn('← Retour', 'btn-ghost', stepHow), btn('Fichier plutôt', '', stepFile), btn('Terminé', 'btn-primary', () => sh.close())]);
  };

  /* ---- fichier .oc : case « Chiffrer », 3 sorties ---- */
  const stepFile = () => {
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
    sh.setFoot([btn('← Retour', 'btn-ghost', stepHow), btn('Terminé', 'btn-primary', () => sh.close())]);
  };

  stepHow();
}
