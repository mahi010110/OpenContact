/* ============================================================
   OpenContact — interface · « Moi »
   Ce qui n'appartient qu'à l'utilisateur : profil (remplit les
   emails), CV & lettre en PDF (IndexedDB, séparés des pistes),
   modèles d'emails, sauvegarde complète (mot de passe optionnel),
   restauration, aide condensée — et le coup de pouce IA, rangé
   ici sans faire d'ombre au reste.
   ============================================================ */
import { APP_VERSION, normalizeCompany, normalizeContact, normalizeProfile } from '../engine/model.js';
import { fullPayload, parseInput } from '../engine/exchange.js';
import { encryptOC2 } from '../engine/crypto.js';
import { fmtSize, todayISO, esc } from '../engine/utils.js';
import { mergeTombs } from '../engine/sync.js';
import { docGet } from '../engine/storage.js';
import { listDocs, docKind, docTitle, pickPdf, removeDoc } from './docs.js';
import { S, bus, saveData, saveProfile, saveOrphans, saveTombs, logJ } from './state.js';
import { $, ic, toast, btn, openSheet, confirmSheet, showUndo } from './dom.js';
import { openProfil, openTemplates } from './profil.js';
import { openAppareils } from './direct.js';
import { getSync } from './synclive.js';
import { isProtected, openProtectFlow, openManageSheet, verrouLabel, requireCode } from './verrou.js';
import { openConnexions, openAssistantIA, mailStateLabel, mailAccount, aiStateLabel, aiConnection } from './connexions.js';
import { loadCompanion, openAddCompanion, openCompanionSheet } from './compagnon.js';
import { DIST_PAGE } from '../engine/distribution.js';

/* ---------- garder une copie (.oc complet) ---------- */
export function downloadBackup(pass){
  const doIt = async () => {
    const payload = fullPayload(S.companies, S.profile, S.orphans, S.tombs);
    const txt = pass ? await encryptOC2(payload, pass) : JSON.stringify(payload);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'application/octet-stream' }));
    a.download = 'opencontact-sauvegarde-' + todayISO() + '.oc';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    /* l'état « N pistes depuis ta dernière copie » repart d'ici (#4) */
    S.profile.flags.lastBackupAt = Date.now();
    saveProfile();
    logJ('Copie téléchargée' + (pass ? ' (chiffrée)' : ''));
    toast('Copie gardée ✓');
    bus.refresh();
  };
  return doIt();
}

function openBackupSheet(){
  const sh = openSheet({ title: 'Copie avec mot de passe', icon: 'save' });
  sh.body.innerHTML =
    `<div class="field"><label for="bkPass">Mot de passe</label>
       <input id="bkPass" type="password" autocomplete="new-password">
       <p class="hint">Perdu = copie irrécupérable.</p></div>`;
  sh.setFoot([
    btn('Garder la copie', 'btn-primary', async () => {
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
    orphans: JSON.stringify(S.orphans),
    tombs: JSON.stringify(S.tombs)
  };
  S.companies = obj.companies.map(normalizeCompany);
  if (obj.profile) S.profile = normalizeProfile(obj.profile);
  S.orphans = Array.isArray(obj.orphans) ? obj.orphans.map(normalizeContact) : [];
  /* les suppressions repartent de la sauvegarde : sans ça, une vieille
     pierre tombale re-supprimerait une piste restaurée à la sync suivante */
  S.tombs = mergeTombs(Array.isArray(obj.tombs) ? obj.tombs : [], []);
  saveData(); saveProfile(); saveOrphans(); saveTombs();
  logJ('Sauvegarde restaurée : ' + n + ' piste(s)');
  bus.refresh();
  showUndo(`${ic('check', 'ic-14')} Restauré : ${n} piste${n > 1 ? 's' : ''}.`, () => {
    S.companies = JSON.parse(snap.companies).map(normalizeCompany);
    S.profile = normalizeProfile(JSON.parse(snap.profile));
    S.orphans = JSON.parse(snap.orphans).map(normalizeContact);
    S.tombs = mergeTombs(JSON.parse(snap.tombs), []);
    saveData(); saveProfile(); saveOrphans(); saveTombs();
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
  sh.setFoot([btn('Déverrouiller', 'btn-primary', go)]);
}

/* ---------- CV & lettres : variantes nommées (#4) ---------- */
async function renderDocs(){
  const box = $('#moiDocs');
  if (!box) return;
  const docs = await listDocs();
  box.innerHTML = docs.map(d =>
    `<div class="doc-row">
       <span class="doc-name">${ic('attachment', 'ic-14')} <b>${esc(docTitle(d))}</b> · ${docKind(d.key) === 'cv' ? 'CV' : 'lettre'} · ${fmtSize(d.size)}</span>
       <button class="btn btn-sm" data-see="${esc(d.key)}">Voir</button>
       <button class="abtn abtn-sm" data-del="${esc(d.key)}" aria-label="Retirer ${esc(docTitle(d))}" title="Retirer">${ic('trash', 'ic-14')}</button>
     </div>`).join('');
  box.querySelectorAll('[data-see]').forEach(b =>
    b.addEventListener('click', async () => {
      const doc = await docGet(b.dataset.see).catch(() => null);
      if (!doc) return;
      const url = URL.createObjectURL(new Blob([doc.blob], { type: doc.type || 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }));
  box.querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', async () => {
      const ok = await confirmSheet({ title: 'Retirer ce document ?', danger: true, okLabel: 'Retirer',
        msg: 'Retiré de cet appareil seulement.' });
      if (!ok) return;
      await removeDoc(b.dataset.del).catch(() => {});
      renderDocs();
    }));
}

/* ---------- l'écran : Profil & données + Réglages (#20) ---------- */
function syncLabel(){
  const sy = getSync();
  if (!sy.phrase) return 'non relié';
  if (sy.state === 'on') return 'relié — ' + sy.peers + ' en face';
  if (sy.state === 'link') return 'relié — premier échange…';
  if (sy.state === 'err' || sy.state === 'norelay') return 'relié — réseau bloqué ?';
  if (sy.state === 'rtcfail') return 'relié — liaison directe en échec';
  return 'relié — en attente';
}
/* « N pistes depuis ta dernière copie » — l'état qui pousse au geste (#4) ;
   se calme quand les appareils reliés dupliquent déjà les données */
function backupState(){
  const last = Number((S.profile.flags || {}).lastBackupAt) || 0;
  return {
    last,
    linked: !!getSync().phrase,
    n: S.companies.filter(c => (c.updatedAt || 0) > last).length
  };
}

/* les lignes de Réglages — noms clairs (#21) : nom + état + geste,
   aucune explication ici (elle vit sur le 2ᵉ écran). Messagerie et IA
   exigent le code : sans protection, le bouton dit le vrai premier
   geste — « Protéger pour… » — au lieu d'un « Connecter » qui refuse
   ensuite (N9). Le Compagnon a un vrai bouton : Télécharger sur
   ordinateur, Copier le lien sur téléphone (#21). */
function reglagesRowsHTML(){
  const prot = isProtected();
  return (
    `<div class="ec-row">
       <div class="ec-row-m"><b>${ic('lock', 'ic-14')} Protection</b>
         <span class="ec-sub">${verrouLabel()}</span></div>
       <button class="btn" id="moiVerrou">${prot ? 'Gérer' : 'Protéger'}</button>
     </div>
     <div class="ec-row">
       <div class="ec-row-m"><b>${ic('switch', 'ic-14')} Mes appareils</b>
         <span class="ec-sub" id="moiSyncSt">${syncLabel()}</span></div>
       <button class="btn" id="moiSync">${getSync().phrase ? 'Gérer' : 'Relier'}</button>
     </div>
     <div class="ec-row">
       <div class="ec-row-m"><b>${ic('mail', 'ic-14')} Ma messagerie</b>
         <span class="ec-sub">${mailStateLabel()}</span></div>
       <button class="btn" id="moiCx">${!prot ? 'Protéger pour connecter' : (mailAccount() ? 'Gérer' : 'Connecter')}</button>
     </div>
     <div class="ec-row">
       <div class="ec-row-m"><b>${ic('sparkles', 'ic-14')} Mon assistant IA</b>
         <span class="ec-sub">${aiStateLabel()}</span></div>
       <button class="btn" id="moiAi">${!prot ? 'Protéger pour brancher' : (aiConnection() ? 'Gérer' : 'Brancher')}</button>
     </div>
     <div class="ec-row" style="border:0">
       <div class="ec-row-m"><b>${ic('switch', 'ic-14')} Le Compagnon</b>
         <span class="ec-sub" id="moiCompSt">${mqWideMoi.matches ? 'pas encore installé' : 's’installe sur ton ordinateur'}</span></div>
       <button class="btn" id="moiComp">${mqWideMoi.matches ? 'Télécharger' : 'Copier le lien'}</button>
     </div>
     <div class="rg-foot">
       <button class="linklike" id="moiRestore">${ic('reload', 'ic-14')} Restaurer une copie</button>
       <input type="file" id="moiRestoreFile" accept=".oc,.txt,.json,application/octet-stream,application/json,text/plain" hidden>
     </div>`);
}
/* l'état du lien vit : peers, liaison, rupture */
function bindSyncLive(root){
  if (root.__onSync) document.removeEventListener('oc:sync', root.__onSync);
  root.__onSync = () => {
    if (root.hidden){ document.removeEventListener('oc:sync', root.__onSync); root.__onSync = null; return; }
    const lbl = root.querySelector('#moiSyncSt');
    const b = root.querySelector('#moiSync');
    if (lbl) lbl.textContent = syncLabel();
    if (b) b.textContent = getSync().phrase ? 'Gérer' : 'Relier';
  };
  document.addEventListener('oc:sync', root.__onSync);
}

function bindReglages(box){
  const q = s => box.querySelector(s);
  q('#moiVerrou').addEventListener('click', () =>
    isProtected() ? openManageSheet() : openProtectFlow());
  q('#moiSync').addEventListener('click', openAppareils);
  /* N9 : le bouton a promis « Protéger pour… » — il y va tout droit */
  q('#moiCx').addEventListener('click', () =>
    isProtected() ? openConnexions() : openProtectFlow());
  q('#moiAi').addEventListener('click', () =>
    isProtected() ? openAssistantIA() : openProtectFlow());
  q('#moiComp').addEventListener('click', async () => {
    const assoc = await loadCompanion().catch(() => null);
    if (assoc){ openCompanionSheet(assoc); return; }
    if (mqWideMoi.matches){ openAddCompanion(); return; }
    try {
      await navigator.clipboard.writeText(DIST_PAGE);
      toast('Lien copié — ouvre-le sur ton ordinateur.');
    } catch (e) { toast('Copie impossible ici — le lien : ' + DIST_PAGE); }
  });
  loadCompanion().then(a => {
    if (!a) return;
    const st = q('#moiCompSt');
    const b = q('#moiComp');
    if (st) st.textContent = 'associé — ' + (a.nom || 'ton ordinateur');
    if (b) b.textContent = 'Gérer';
  }).catch(() => {});
  const rf = q('#moiRestoreFile');
  /* restaurer = rare et sensible (#4) : rangé ici, le code d'abord */
  q('#moiRestore').addEventListener('click', async () => {
    if (await requireCode('Ton code, pour restaurer')) rf.click();
  });
  rf.addEventListener('change', () => { if (rf.files[0]) restoreFile(rf.files[0]); });
}

/* mobile : Réglages est le 2ᵉ écran de « Moi » (la porte #20) — un vrai
   écran re-rendu par bus.refresh, jamais une feuille qui gèlerait ses états */
let reglagesOpen = false;
const mqWideMoi = matchMedia('(min-width:901px)');
mqWideMoi.addEventListener('change', () => { if (S.route === 'moi') renderMoi(); });

export function renderMoi(){
  const root = $('#view-moi');
  const wide = mqWideMoi.matches;

  if (!wide && reglagesOpen){
    root.innerHTML =
      `<div class="page-inner">
         <div class="td-head">
           <button class="btn icon-btn" id="moiBack" aria-label="Retour à Moi">${ic('arrow-left', 'ic-14')}</button>
           <h2>Réglages</h2>
         </div>
         <div class="pcard">${reglagesRowsHTML()}</div>
       </div>`;
    root.querySelector('#moiBack').addEventListener('click', () => { reglagesOpen = false; renderMoi(); });
    bindReglages(root);
    bindSyncLive(root);
    return;
  }

  const p = S.profile;
  const pReady = p.name && p.email;
  const bk = backupState();
  const showBackup = !!(S.companies.length || p.name);   /* rien à copier = carte absente */
  const bkPromote = showBackup && !bk.linked && (!bk.last || bk.n > 0);
  const bkState = bk.linked
    ? 'Tes appareils reliés la gardent déjà en double.'
    : !bk.last
      ? 'Aucune copie encore.'
      : bk.n
        ? `<b>${bk.n} piste${bk.n > 1 ? 's' : ''}</b> depuis ta dernière copie.`
        : 'À jour.';

  const cards =
    `<div class="pcard">
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
       <h3>${ic('attachment', 'ic-14')} Mes CV &amp; lettres <span class="lbl-soft">PDF, sur cet appareil</span></h3>
       <div id="moiDocs"></div>
       <div class="pc-actions">
         <button class="btn btn-sm" id="moiDocCv">${ic('plus', 'ic-14')} CV</button>
         <button class="btn btn-sm" id="moiDocLm">${ic('plus', 'ic-14')} Lettre</button>
       </div>
     </div>

     ${showBackup ? `
     <div class="pcard">
       <h3>${ic('save', 'ic-14')} Garder une copie <span class="tag-priv">privé inclus</span></h3>
       <p class="pd">${bkState}</p>
       <div class="pc-actions">
         <button class="btn ${bkPromote ? 'btn-primary' : ''}" id="moiBackup">${ic('download', 'ic-14')} Garder une copie</button>
         <button class="linklike" id="moiBackupPass">avec un mot de passe</button>
       </div>
       <div class="stor-line" id="moiStor"></div>
     </div>` : ''}`;

  const reglages = `<div class="pcard">
       ${wide ? `<h3>${ic('settings-2', 'ic-14')} Réglages</h3>` : ''}
       ${reglagesRowsHTML()}
     </div>`;

  root.innerHTML =
    `<div class="page-inner${wide ? ' page-wide' : ''}">
       <div class="td-head"><h2>Moi</h2><div class="td-date">privé — jamais partagé</div></div>
       ${wide
         ? `<div class="moi-cols"><div>${cards}</div><div>${reglages}</div></div>`
         : cards +
           `<button class="pcard moi-door" id="moiReglages">
              <span class="md-m"><b>${ic('settings-2', 'ic-14')} Réglages</b>
                <span class="ec-sub">protection · appareils · messagerie · IA · Compagnon</span></span>
              ${ic('chevron-right', 'ic-14')}
            </button>`}
       <div class="moi-ver">OpenContact ${APP_VERSION} · local-first, sans compte · fichier .oc</div>
     </div>`;

  root.querySelector('#moiProfil').addEventListener('click', () => openProfil());
  root.querySelector('#moiTpl').addEventListener('click', openTemplates);
  root.querySelector('#moiBackup')?.addEventListener('click', () => downloadBackup(''));
  root.querySelector('#moiBackupPass')?.addEventListener('click', openBackupSheet);
  if (wide) bindReglages(root);
  else root.querySelector('#moiReglages').addEventListener('click', () => {
    reglagesOpen = true;
    renderMoi();
    root.scrollTop = 0;
  });
  bindSyncLive(root);
  root.querySelector('#moiDocCv').addEventListener('click', () => pickPdf('cv', renderDocs));
  root.querySelector('#moiDocLm').addEventListener('click', () => pickPdf('lm', renderDocs));
  renderDocs();
  if (navigator.storage && navigator.storage.estimate){
    navigator.storage.estimate().then(({ usage, quota }) => {
      if (usage != null && quota){
        const el = $('#moiStor');
        if (el) el.textContent = 'Espace local utilisé : ' + fmtSize(usage) + ' sur ' + fmtSize(quota) + '.';
      }
    }).catch(() => {});
  }
}
