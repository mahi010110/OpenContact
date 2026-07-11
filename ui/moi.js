/* ============================================================
   OpenContact — interface · « Moi »
   Ce qui n'appartient qu'à l'utilisateur : profil (remplit les
   emails), CV & lettre en PDF (IndexedDB, séparés des pistes),
   modèles d'emails, sauvegarde complète (mot de passe optionnel),
   restauration, aide condensée — et le coup de pouce IA, rangé
   ici sans faire d'ombre au reste.
   ============================================================ */
import { APP_VERSION, normalizeCompany, normalizeContact, normalizeProfile,
         defaultPrompts, PROMPTS_MAX, PROMPT_MAX_LEN } from '../engine/model.js';
import { fullPayload, parseInput } from '../engine/exchange.js';
import { encryptOC2 } from '../engine/crypto.js';
import { fmtSize, todayISO, esc } from '../engine/utils.js';
import { docGet, docPut, docDel } from '../engine/storage.js';
import { S, bus, saveData, saveProfile, saveOrphans, logJ, isClosed } from './state.js';
import { $, ic, toast, btn, openSheet, confirmSheet, showUndo } from './dom.js';
import { openProfil, openTemplates } from './profil.js';

/* ---------- sauvegarde (.oc complet) ---------- */
export function downloadBackup(pass){
  const doIt = async () => {
    const payload = fullPayload(S.companies, S.profile, S.orphans);
    const txt = pass ? await encryptOC2(payload, pass) : JSON.stringify(payload);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'application/octet-stream' }));
    a.download = 'opencontact-sauvegarde-' + todayISO() + '.oc';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    logJ('Sauvegarde téléchargée' + (pass ? ' (chiffrée)' : ''));
    toast('Sauvegarde téléchargée.');
  };
  return doIt();
}

function openBackupSheet(){
  const sh = openSheet({ title: 'Ma sauvegarde', icon: 'save' });
  sh.body.innerHTML =
    `<p class="hint" style="margin:0 0 12px"><span class="tag-priv">privé inclus</span> Tout, dans un fichier — pour toi seul.</p>
     <div class="field"><label for="bkPass">Mot de passe <span class="lbl-soft">— optionnel</span></label>
       <input id="bkPass" type="password" placeholder="Vide = lisible par tous" autocomplete="new-password">
       <p class="hint">Chiffré si tu en mets un — perdu = irrécupérable.</p></div>`;
  sh.setFoot([
    btn('Annuler', 'btn-ghost', () => sh.close()),
    btn('Télécharger', 'btn-primary', async () => {
      await downloadBackup(sh.body.querySelector('#bkPass').value || '');
      sh.close();
    }, 'download')
  ]);
}

/* ---------- restauration (remplace tout, annulable ~30 s) ---------- */
function restoreFile(file){
  const r = new FileReader();
  r.onload = () => treatRestore(String(r.result));
  r.readAsText(file);
}
async function treatRestore(raw, pass){
  let obj;
  try {
    obj = await parseInput(raw, pass);
  } catch (e) {
    if (e.message === 'besoinpass' || e.message === 'motdepasse'){
      if (e.message === 'motdepasse') toast('Mot de passe incorrect.');
      askRestorePass(raw);
      return;
    }
    toast(e.message === 'format' ? 'Ce fichier n’est pas une sauvegarde OpenContact.' : 'Lecture impossible : ' + e.message);
    return;
  }
  if (obj.kind === 'share'){
    toast('C’est un partage de pistes, pas une sauvegarde — passe par Échanger → Recevoir pour le fusionner.');
    return;
  }
  const n = obj.companies.length;
  const cur = S.companies.length;
  const ok = await confirmSheet({
    title: 'Restaurer cette sauvegarde ?', icon: 'reload', danger: true, okLabel: 'Tout remplacer',
    msg: `Le fichier contient <b>${n} piste${n > 1 ? 's' : ''}</b>${obj.profile ? ', le profil' : ''}${obj.orphans ? ', ' + obj.orphans.length + ' contact(s) à rattacher' : ''}.<br>
          Ta base actuelle (<b>${cur} piste${cur > 1 ? 's' : ''}</b>) sera <b>entièrement remplacée</b> — annulable pendant 30 secondes.`
  });
  if (!ok) return;
  const snap = {
    companies: JSON.stringify(S.companies),
    profile: JSON.stringify(S.profile),
    orphans: JSON.stringify(S.orphans)
  };
  S.companies = obj.companies.map(normalizeCompany);
  if (obj.profile) S.profile = normalizeProfile(obj.profile);
  S.orphans = Array.isArray(obj.orphans) ? obj.orphans.map(normalizeContact) : [];
  saveData(); saveProfile(); saveOrphans();
  logJ('Sauvegarde restaurée : ' + n + ' piste(s)');
  bus.refresh();
  showUndo(`${ic('check', 'ic-14')} Restauré : ${n} piste${n > 1 ? 's' : ''}.`, () => {
    S.companies = JSON.parse(snap.companies).map(normalizeCompany);
    S.profile = normalizeProfile(JSON.parse(snap.profile));
    S.orphans = JSON.parse(snap.orphans).map(normalizeContact);
    saveData(); saveProfile(); saveOrphans();
    logJ('Restauration annulée');
    bus.refresh();
    toast('Restauration annulée — tout est revenu comme avant.');
  });
}
function askRestorePass(raw){
  const sh = openSheet({ title: 'Sauvegarde protégée', icon: 'lock', focus: '#rsPass' });
  sh.body.innerHTML =
    `<div class="field"><label for="rsPass">Mot de passe de la sauvegarde</label>
       <input id="rsPass" type="password" autocomplete="off"></div>`;
  const go = () => { const p = sh.body.querySelector('#rsPass').value; sh.close(); treatRestore(raw, p); };
  sh.body.querySelector('#rsPass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  sh.setFoot([btn('Annuler', 'btn-ghost', () => sh.close()), btn('Déverrouiller', 'btn-primary', go)]);
}

/* ---------- CV & lettre (PDF, IndexedDB — séparés des pistes) ---------- */
const DOCS = [['cv', 'Mon CV'], ['lettre', 'Ma lettre type']];
async function docLine(key, label){
  let d = null;
  try { d = await docGet(key); } catch (e) {}
  const row = $('#doc-' + key);
  if (!row) return;
  row.innerHTML = d
    ? `<span class="doc-name">${ic('attachment', 'ic-14')} <b>${esc(d.name)}</b> · ${fmtSize(d.size)}</span>
       <button class="btn btn-sm" data-see="${key}">Voir</button>
       <button class="abtn abtn-sm" data-del="${key}" aria-label="Retirer ${label}" title="Retirer">${ic('trash', 'ic-14')}</button>`
    : `<span class="doc-name doc-none">${esc(label)} — aucun fichier</span>
       <button class="btn btn-sm" data-add="${key}">${ic('upload', 'ic-14')} Ajouter</button>`;
  row.querySelector('[data-see]')?.addEventListener('click', async () => {
    const doc = await docGet(key);
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([doc.blob], { type: doc.type || 'application/pdf' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  row.querySelector('[data-del]')?.addEventListener('click', async () => {
    const ok = await confirmSheet({ title: 'Retirer ce document ?', danger: true, okLabel: 'Retirer',
      msg: 'Retiré de cet appareil seulement.' });
    if (!ok) return;
    await docDel(key).catch(() => {});
    docLine(key, label);
  });
  row.querySelector('[data-add]')?.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/pdf';
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      if (f.size > 8 * 1048576){ toast('Trop lourd (8 Mo max) — allège le PDF.'); return; }
      try {
        await docPut(key, { name: f.name, size: f.size, type: f.type, added: Date.now(), blob: f });
        toast('Document rangé.');
      } catch (e) { toast('Stockage indisponible sur ce navigateur.'); }
      docLine(key, label);
    });
    inp.click();
  });
}

/* ---------- prompts IA : les SIENS — créés, modifiés, bornés ----------
   Un seul livré d'origine (« Mes emails → pistes », qui fabrique un JSON
   à coller dans Recevoir) ; le reste appartient à l'utilisateur. Ils
   vivent dans le profil, donc voyagent entre ses appareils. */
function editPrompt(i){
  const isNew = i < 0;
  const src = isNew ? { name: '', text: '' } : S.profile.prompts[i];
  const sh = openSheet({ title: isNew ? 'Nouveau prompt' : 'Modifier le prompt', icon: 'sparkles', focus: '#ppName' });
  sh.body.innerHTML =
    `<div class="field"><label for="ppName">Nom</label>
       <input id="ppName" value="${esc(src.name)}" maxlength="60" placeholder="Ex : Préparer un entretien"></div>
     <div class="field"><label for="ppText">Le prompt <span class="lbl-soft">— [crochets] = à remplacer au moment de coller</span></label>
       <textarea id="ppText" maxlength="${PROMPT_MAX_LEN}" style="min-height:180px">${esc(src.text)}</textarea>
       <p class="hint" style="text-align:right"><span id="ppCount">${src.text.length}</span> / ${PROMPT_MAX_LEN}</p></div>`;
  const q = s => sh.body.querySelector(s);
  q('#ppText').addEventListener('input', () => { q('#ppCount').textContent = q('#ppText').value.length; });
  const foot = [
    btn('Annuler', 'btn-ghost', () => sh.close()),
    btn('Enregistrer', 'btn-primary', () => {
      const name = q('#ppName').value.trim();
      const text = q('#ppText').value.trim();
      if (!name || !text){ toast('Un nom et un contenu — il manque l’un des deux.'); return; }
      if (isNew) S.profile.prompts.push({ name, text: text.slice(0, PROMPT_MAX_LEN) });
      else S.profile.prompts[i] = { name, text: text.slice(0, PROMPT_MAX_LEN) };
      saveProfile();
      sh.close();
      bus.refresh();
      toast('Prompt enregistré ✓');
    })
  ];
  if (!isNew && S.profile.prompts.length > 1){
    foot.unshift(btn('Supprimer', 'btn-danger', async () => {
      const ok = await confirmSheet({ title: 'Supprimer ce prompt ?', danger: true, okLabel: 'Supprimer', icon: 'trash',
        msg: `<b>${esc(src.name)}</b> sera retiré de tes prompts.` });
      if (!ok) return;
      S.profile.prompts.splice(i, 1);
      saveProfile();
      sh.close();
      bus.refresh();
    }));
  }
  sh.setFoot(foot);
}

/* ---------- l'écran ---------- */
export function renderMoi(){
  const root = $('#view-moi');
  const p = S.profile;
  const pReady = p.name && p.email;
  const alive = S.companies.filter(c => !isClosed(c)).length;
  root.innerHTML =
    `<div class="page-inner">
       <div class="td-head"><h2>Moi</h2><div class="td-date">privé — jamais partagé</div></div>

       <div class="pcard">
         <h3>${ic('user', 'ic-14')} Mon profil</h3>
         <p class="pd">${pReady
            ? `<b>${esc(p.name)}</b>${p.formation ? ' · ' + esc(p.formation) : ''} — tes emails se signent tout seuls.`
            : 'Nom, formation, contact : une fois remplis, chaque email part signé et complet.'}</p>
         <div class="pc-actions">
           <button class="btn ${pReady ? '' : 'btn-primary'}" id="moiProfil">${ic('pencil', 'ic-14')} ${pReady ? 'Modifier' : 'Remplir mon profil'}</button>
           <button class="btn" id="moiTpl">${ic('mail', 'ic-14')} Modèles d’emails (${p.templates.length})</button>
         </div>
       </div>

       <div class="pcard">
         <h3>${ic('attachment', 'ic-14')} CV &amp; lettre <span class="lbl-soft">PDF, sur cet appareil</span></h3>
         <div class="doc-row" id="doc-cv"></div>
         <div class="doc-row" id="doc-lettre"></div>
       </div>

       <div class="pcard">
         <h3>${ic('save', 'ic-14')} Ma sauvegarde <span class="tag-priv">privé inclus</span></h3>
         <p class="pd">${S.companies.length} piste${S.companies.length > 1 ? 's' : ''} (${alive} vivante${alive > 1 ? 's' : ''}), suivi et profil dans un fichier <b>.oc</b> — à refaire régulièrement.</p>
         <div class="pc-actions">
           <button class="btn btn-primary" id="moiBackup">${ic('download', 'ic-14')} Télécharger</button>
           <button class="btn" id="moiRestore">${ic('reload', 'ic-14')} Restaurer</button>
           <input type="file" id="moiRestoreFile" accept=".oc,.txt,.json,application/octet-stream,application/json,text/plain" hidden>
         </div>
         <div class="stor-line" id="moiStor"></div>
       </div>

       <details class="pcard pcard-details">
         <summary><h3>${ic('sparkles', 'ic-14')} Coup de pouce IA</h3></summary>
         <p class="pd">Tes prompts, à coller dans l’assistant de ton choix. « Mes emails → pistes » fabrique un JSON à coller dans <b>Échanger → Recevoir</b>.</p>
         ${p.prompts.map((pr, i) =>
           `<div class="prompt-row">
              <b>${esc(pr.name)}</b>
              <button class="btn btn-sm" data-prompt="${i}">${ic('copy', 'ic-14')} Copier</button>
              <button class="abtn abtn-sm" data-pedit="${i}" aria-label="Modifier ${esc(pr.name)}" title="Modifier">${ic('pencil', 'ic-14')}</button>
            </div>`).join('')}
         ${p.prompts.length < PROMPTS_MAX
           ? `<button class="btn btn-sm" id="moiPromptAdd" style="margin-top:10px">${ic('plus', 'ic-14')} Nouveau prompt</button>`
           : `<p class="hint" style="margin-top:8px">${PROMPTS_MAX} prompts max — supprime-en un pour en créer un autre.</p>`}
         <button class="linklike" id="moiPromptReset" style="margin-top:8px">Revenir au prompt d’origine</button>
       </details>

       <details class="pcard pcard-details">
         <summary><h3>${ic('book-open', 'ic-14')} Comment ça marche</h3></summary>
         <ul class="help-list">
           <li><b>Local-first.</b> Tout vit sur tes appareils — pas de compte, pas de serveur.</li>
           <li><b>Une piste = une entreprise</b>, avec une prochaine action + une date : c’est ce qui nourrit « Aujourd’hui ».</li>
           <li><b>Échanger</b> synchronise tes appareils et fait circuler les fiches — jamais ton suivi.</li>
           <li><b>Raccourci :</b> « / » saute à la recherche.</li>
         </ul>
       </details>

       <div class="moi-ver">OpenContact ${APP_VERSION} · local-first, sans compte · fichier .oc</div>
     </div>`;

  root.querySelector('#moiProfil').addEventListener('click', () => openProfil());
  root.querySelector('#moiTpl').addEventListener('click', openTemplates);
  root.querySelector('#moiBackup').addEventListener('click', openBackupSheet);
  const rf = root.querySelector('#moiRestoreFile');
  root.querySelector('#moiRestore').addEventListener('click', () => rf.click());
  rf.addEventListener('change', () => { if (rf.files[0]) restoreFile(rf.files[0]); });
  root.querySelectorAll('[data-prompt]').forEach(b =>
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(S.profile.prompts[+b.dataset.prompt].text); toast('Copié — colle-le dans ton assistant.'); }
      catch (e) { toast('Copie impossible ici.'); }
    }));
  root.querySelectorAll('[data-pedit]').forEach(b =>
    b.addEventListener('click', () => editPrompt(+b.dataset.pedit)));
  root.querySelector('#moiPromptAdd')?.addEventListener('click', () => editPrompt(-1));
  root.querySelector('#moiPromptReset')?.addEventListener('click', async () => {
    const ok = await confirmSheet({ title: 'Revenir au prompt d’origine ?', okLabel: 'Réinitialiser',
      msg: 'Tes prompts actuels seront remplacés par le seul prompt d’origine (« Mes emails → pistes »).', danger: true });
    if (!ok) return;
    S.profile.prompts = defaultPrompts();
    saveProfile();
    bus.refresh();
  });
  DOCS.forEach(([k, l]) => docLine(k, l));
  if (navigator.storage && navigator.storage.estimate){
    navigator.storage.estimate().then(({ usage, quota }) => {
      if (usage != null && quota){
        $('#moiStor').textContent = 'Espace local utilisé : ' + fmtSize(usage) + ' sur ' + fmtSize(quota) + '.';
      }
    }).catch(() => {});
  }
}
