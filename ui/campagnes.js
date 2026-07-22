/* ============================================================
   OpenContact — interface · campagnes (le vécu quotidien)
   Pas d'écran « campagnes » : le départ est la bifurcation de
   Prospecter, le vécu est UNE ligne groupée par jour dans
   « Aujourd'hui » (D13) — tap → la feuille du jour, chaque envoi
   déclenché par l'utilisateur (par ligne ou « Tout envoyer »),
   rien d'automatique sans Compagnon. Une réponse marquée sur la
   fiche arrête les relances de cette piste (non débrayable) ;
   la réconciliation se fait à l'affichage, sans crochet invasif.
   ============================================================ */
import { esc, todayISO } from '../engine/utils.js';
import { fillTpl, pushHist } from '../engine/model.js';
import { buildCampaign, dueSends, dueSendsAll, markSent, markReplied, markError,
         pauseCampaign, resumeCampaign, stopCampaign, campaignStats,
         DAILY_CAP, OPPOSITION, inSendWindow, SEND_WINDOW_TXT } from '../engine/campaign.js';
import { sendMail } from '../engine/mailer.js';
import { CAMPAIGNS_KEY, MISSIONS_KEY, kvGet, kvSet } from '../engine/storage.js';
import { makeMission, signMission } from '../engine/mission.js';
import { probeCompanion, companionCall } from '../engine/companion.js';
import { S, bus, saveData, logJ, isClosed } from './state.js';
import { openSheet, openPanel, confirmSheet, toast, btn, ic } from './dom.js';
import { mailAccount, freshToken, openConnexions } from './connexions.js';
import { requireCode } from './verrou.js';
import { loadCompanion } from './compagnon.js';
import { deviceSelf, ensureKeys, getRing, ringCompanion } from './synclive.js';

let campaigns = null;

export async function loadCampaigns(){
  try { campaigns = JSON.parse(await kvGet(CAMPAIGNS_KEY) || '[]') || []; }
  catch (e) { campaigns = []; }
  if (!Array.isArray(campaigns)) campaigns = [];
  /* en arrière-plan : confier ce qui attend, replier le journal */
  reconcileCompanion().catch(() => {});
  return campaigns;
}
const syncNotice = () => document.dispatchEvent(new CustomEvent('oc:change'));
const save = async () => { await kvSet(CAMPAIGNS_KEY, JSON.stringify(campaigns || [])); syncNotice(); };
const touch = c => Object.assign({}, c, { updatedAt: Date.now() });
const all = () => campaigns || [];
const live = () => all().filter(c => c.state === 'ready' || c.state === 'paused');
/* les envois dus de CETTE campagne, sous le plafond GLOBAL (15/j
   toutes campagnes) — la seule liste que l'écran a le droit d'offrir */
const dueFor = (c, today) => dueSendsAll(all().map(x => x.id === c.id ? c : x), today)
  .filter(d => d.cpId === c.id);

/* ---------- les bons de mission (campagnes confiées au Compagnon) ---------- */
let missions = null;
async function loadMissions(){
  try { missions = JSON.parse(await kvGet(MISSIONS_KEY) || '[]') || []; }
  catch (e) { missions = []; }
  if (!Array.isArray(missions)) missions = [];
  return missions;
}
const saveMissions = async () => { await kvSet(MISSIONS_KEY, JSON.stringify(missions || [])); syncNotice(); };
const missionOf = cpId => (missions || []).find(m => m.cpId === cpId && m.state !== 'revoquee');

/* La sync privée écrit le stockage sans importer ce module (pas de cycle
   d'imports) : cet événement recharge les caches puis remet la mission au
   Compagnon local. Plusieurs notifications rapprochées convergent. */
let privateReload = null;
let privateReloadAgain = false;
document.addEventListener('oc:campaigns-sync', () => {
  if (privateReload){ privateReloadAgain = true; return; }
  privateReload = Promise.all([kvGet(CAMPAIGNS_KEY), kvGet(MISSIONS_KEY)]).then(([cs, ms]) => {
    try { campaigns = JSON.parse(cs || '[]') || []; } catch (e) { campaigns = []; }
    try { missions = JSON.parse(ms || '[]') || []; } catch (e) { missions = []; }
    if (!Array.isArray(campaigns)) campaigns = [];
    if (!Array.isArray(missions)) missions = [];
    bus.refresh();
    return reconcileCompanion();
  }).catch(() => {}).finally(() => {
    privateReload = null;
    if (privateReloadAgain){
      privateReloadAgain = false;
      document.dispatchEvent(new CustomEvent('oc:campaigns-sync'));
    }
  });
});

/* bâtir + signer le bon : la campagne part FIGÉE, la garde Rust du
   Compagnon re-vérifie la signature à chaque lecture */
async function buildCampaignMission(c){
  const self = await deviceSelf();
  const keys = await ensureKeys();
  if (!keys) throw new Error('anneau');
  const m = makeMission('campaign-run', { campaign: {
    id: c.id, state: 'ready',
    targets: c.targets.map(t => ({ tid: t.tid, cid: t.cid, email: t.email, who: t.who,
      startAt: t.startAt, state: t.state, msgs: t.msgs }))
  } });
  return { mid: m.mid, cpId: c.id, wire: await signMission(m, self.id, keys.seed),
    state: 'a_confier', stops: [] };
}
async function remettreMission(rec, assoc0, found0){
  const assoc = assoc0 || await loadCompanion();
  if (!assoc) return false;
  const found = found0 || await probeCompanion();
  if (!found) return false;
  try {
    const rep = await companionCall(found.base, assoc.k, { t: 'mission', wire: rec.wire });
    if (rep && rep.t === 'mission-ok'){ rec.state = 'confiee'; await saveMissions(); return true; }
  } catch (e) {}
  return false;
}

/* la réconciliation : confier ce qui attend, signaler les réponses,
   replier le journal du Compagnon (idempotent — jamais un doublon) */
let reconcileJob = null;
async function doReconcileCompanion(){
  const assoc = await loadCompanion().catch(() => null);
  if (!assoc || !campaigns) return;
  await loadMissions();
  const autos = all().filter(c => c.auto);
  if (!autos.length &&
      !missions.some(m => m.state === 'a_confier' || (m.state === 'revoquee' && !m.revOk))) return;
  const found = await probeCompanion();
  if (!found) return;
  /* L'anneau peut avoir accueilli le téléphone après l'association du
     Compagnon. Le fil signé reste intact ; seule la liste publique des
     appareils est rafraîchie avant sa vérification. */
  const ring = getRing();
  if (ring){
    try { await companionCall(found.base, assoc.k, { t: 'anneau', ring }); }
    catch (e) {}
  }
  for (const rec of missions.filter(m => m.state === 'a_confier')) await remettreMission(rec, assoc, found);
  /* révocations en attente (l'ordinateur était éteint au moment du geste) */
  for (const rec of missions.filter(m => m.state === 'revoquee' && !m.revOk)){
    try {
      const r = await companionCall(found.base, assoc.k, { t: 'revoquer', mid: rec.mid });
      if (r && r.t === 'ok'){ rec.revOk = true; await saveMissions(); }
    } catch (e) {}
  }
  for (const c of autos){
    const rec = missionOf(c.id);
    if (!rec) continue;
    for (const t of c.targets){
      if (t.state === 'replied' && !rec.stops.includes(t.cid)){
        try {
          await companionCall(found.base, assoc.k, { t: 'arreter-cible', cid: t.cid });
          rec.stops.push(t.cid);
          await saveMissions();
        } catch (e) {}
      }
    }
  }
  try {
    const rap = await companionCall(found.base, assoc.k, { t: 'rapport' });
    if (rap && rap.t === 'rapport'){
      if (Array.isArray(rap.journal)) await foldJournal(rap.journal);
      if (Array.isArray(rap.reponses) && rap.reponses.length) await foldReponses(rap.reponses);
    }
  } catch (e) {}
}
export async function reconcileCompanion(){
  if (reconcileJob) return reconcileJob;
  reconcileJob = doReconcileCompanion().finally(() => { reconcileJob = null; });
  return reconcileJob;
}
/* les réponses DÉTECTÉES par l'ordinateur : relances arrêtées (déjà
   fait là-bas), fiche marquée ici — la boucle produit ↔ suivi se ferme */
async function foldReponses(cids){
  let changed = false;
  campaigns = all().map(c => {
    if (!c.auto) return c;
    let cc = c;
    for (const cid of cids){
      if (!cc.targets.some(x => x.cid === cid)) continue;
      if (cc.targets.some(x => x.cid === cid && x.state === 'active')){
        cc = markReplied(cc, cid);
        changed = true;
      }
      /* la fiche, INDÉPENDAMMENT de la transition de cible : une
         réconciliation précoce (pistes pas encore chargées) ne doit
         pas consommer le marquage — on re-tente tant que la fiche
         n'est pas au bon statut, jamais deux fois la même trace */
      const p = S.companies.find(x => x.id === cid);
      if (p && p.status !== 'reply' && !isClosed(p)){
        pushHist(p, 'Campagne « ' + c.name + ' » — réponse détectée par ton ordinateur, relances arrêtées.');
        if (p.status === 'todo' || p.status === 'active') p.status = 'reply';
        p.updatedAt = Date.now();
        changed = true;
      }
    }
    return changed && cc !== c ? touch(cc) : cc;
  });
  /* les fiches d'abord : quand la campagne repliée devient visible,
     le statut « réponse » l'est déjà aussi */
  if (changed){ saveData(); await save(); bus.refresh(); }
}
async function foldJournal(journal){
  let changed = false;
  campaigns = all().map(c => {
    if (!c.auto) return c;
    let cc = c;
    for (const e of journal){
      if (!e || !String(e.sid || '').startsWith(c.id + '.')) continue;
      if (e.etat === 'fait'){
        const n = (cc.log || []).length;
        cc = markSent(cc, e.sid, e.date || todayISO());
        if (cc.log.length !== n) changed = true;
      } else {
        /* incertain / erreur : cible marquée, jamais re-tentée en silence */
        const tid = String(e.sid).split('.').slice(-2, -1)[0];
        const t = cc.targets.find(x => x.tid === tid);
        if (t && t.state === 'active'){ cc = markError(cc, tid); changed = true; }
      }
    }
    return cc !== c ? touch(cc) : cc;
  });
  if (changed){ await save(); bus.refresh(); }
}

/* la piste est-elle dans une campagne vivante ? (tag fiche/board) */
export function campaignOfPiste(cid){
  return live().find(c => c.targets.some(t => t.cid === cid && t.state === 'active')) || null;
}

/* réponse marquée sur la fiche (statut « réponse » ou clôture) →
   les relances de cette piste s'arrêtent — réconcilié à l'affichage */
export function reconcileReplies(){
  if (!campaigns) return false;
  let changed = false;
  campaigns = campaigns.map(c => {
    let cc = c;
    for (const t of c.targets){
      if (t.state !== 'active') continue;
      const p = S.companies.find(x => x.id === t.cid);
      if (p && (p.status === 'reply' || isClosed(p))){
        cc = markReplied(cc, t.cid);
        pushHist(p, 'Campagne « ' + c.name + ' » arrêtée — réponse reçue.');
        changed = true;
      }
    }
    return cc !== c ? touch(cc) : cc;
  });
  if (changed){ save(); saveData(); }
  return changed;
}

/* ---------- la ou les lignes d'« Aujourd'hui » ---------- */
export function campaignLines(){
  if (!campaigns) return [];
  reconcileReplies();
  const today = todayISO();
  const out = [];
  for (const c of all()){
    const st = campaignStats(c);
    if (c.state === 'ready' && c.auto){
      /* confiée au Compagnon : l'ordinateur appuie, la ligne raconte */
      out.push({ id: c.id, txt: `${c.name} — ton ordinateur s’en occupe · ${st.sent} envoyé${st.sent > 1 ? 's' : ''}${st.replied ? ' · ' + st.replied + ' réponse' + (st.replied > 1 ? 's' : '') : ''}` });
    } else if (c.state === 'ready'){
      const due = dueFor(c, today);
      if (due.length)
        out.push({ id: c.id, txt: `${c.name} — ${due.length} envoi${due.length > 1 ? 's' : ''} prêt${due.length > 1 ? 's' : ''}${st.replied ? ' · ' + st.replied + ' réponse' + (st.replied > 1 ? 's' : '') : ''}` });
      else if (st.replied && !c.ackR){
        out.push({ id: c.id, txt: `${c.name} — ${st.replied} réponse${st.replied > 1 ? 's' : ''} reçue${st.replied > 1 ? 's' : ''}` });
      }
    } else if (c.state === 'paused'){
      out.push({ id: c.id, txt: `${c.name} — en pause` });
    } else if ((c.state === 'done' || c.state === 'stopped') && !c.ack){
      out.push({ id: c.id, txt: `Campagne terminée : ${st.sent} envoyé${st.sent > 1 ? 's' : ''}, ${st.replied} réponse${st.replied > 1 ? 's' : ''}` });
    }
  }
  return out;
}
export function openCampaignById(id){
  const c = all().find(x => x.id === id);
  if (c) openCampaignDay(c);
}

/* ---------- la maison des campagnes (#13) ----------
   « Prospecter = lancer, Campagnes = gérer » : la liste des campagnes
   vivantes avec leur état, même quand rien n'est dû aujourd'hui (N4).
   L'accès n'existe que s'il y en a (loi #6). */
export const liveCampaignsCount = () => live().length;
export function openCampaignsHome(){
  const wide = matchMedia('(min-width:901px)').matches;
  const sh = (wide ? openPanel : openSheet)({ title: 'Campagnes', icon: 'flag' });
  if (!sh) return;
  const stateTxt = c => c.state === 'paused' ? 'en pause'
    : c.auto ? 'ton ordinateur s’en occupe' : 'en cours';
  const render = () => {
    const list = live();
    if (!list.length){ sh.close(); return; }
    sh.body.innerHTML =
      `<div class="pick-list">${list.map(c => {
         const st = campaignStats(c);
         return `<button class="pick" data-cid="${esc(c.id)}">
                   <b>${ic('flag', 'ic-14')} ${esc(c.name)}</b>
                   <span>${stateTxt(c)} · ${st.sent} envoyé${st.sent > 1 ? 's' : ''} · ${st.replied} réponse${st.replied > 1 ? 's' : ''} · ${st.targets} piste${st.targets > 1 ? 's' : ''}</span>
                 </button>`;
       }).join('')}</div>`;
    sh.body.querySelectorAll('[data-cid]').forEach(b =>
      b.addEventListener('click', () => {
        const c = all().find(x => x.id === b.dataset.cid);
        if (!c) return;
        if (!wide) sh.close();
        openCampaignDay(c);
      }));
  };
  render();
}

/* ---------- l'assistant : Prospecter → « En campagne » ---------- */
const STEP_LABELS = ['message', 'relance 1 (J+7)', 'relance 2 (J+14)'];
const monthName = () => new Date().toLocaleDateString('fr-FR', { month: 'long' });

export function openCampaignWizard(list){
  const sh = openSheet({ title: 'En campagne', icon: 'flag' });
  const q = s => sh.body.querySelector(s);
  /* une cible par piste : le premier contact avec email */
  const targets = [];
  const skipped = [];
  for (const c of list){
    const ct = (c.contacts || []).find(t => t.email);
    if (ct) targets.push({ cid: c.id, name: ct.name || '', role: ct.role || '', email: ct.email, company: c.name, companyObj: c });
    else skipped.push(c);
  }
  let compAssoc = null;   /* association locale, seulement sur l'ordinateur */
  let compRing = null;    /* Compagnon connu de l'anneau, visible aussi du téléphone */
  const companionReady = Promise.all([
    loadCompanion().catch(() => null), ringCompanion().catch(() => null)
  ]).then(([a, r]) => { compAssoc = a; compRing = r; });
  const draft = {
    name: 'Prospection — ' + monthName(),
    auto: false,           /* D13 : par défaut, c'est TOI qui appuies */
    subject: '', body: '',
    r1: 'Bonjour {{contact}},\n\nJe me permets de revenir vers vous au sujet de mon message envoyé la semaine dernière — je reste très motivé·e à l’idée d’échanger avec {{entreprise}}.\n\nBonne journée,\n{{moi}}',
    r2: 'Bonjour {{contact}},\n\nDernier message de ma part : si le moment est mal choisi, aucun souci — je reste à votre disposition si une opportunité se présente chez {{entreprise}}.\n\nMerci de votre attention,\n{{moi}}'
  };

  const stepMessage = () => {
    const tpls = S.profile.templates;
    if (!draft.subject && tpls[0]){ draft.subject = tpls[0].subject; draft.body = tpls[0].body; }
    sh.setTitle('En campagne — le message');
    sh.body.innerHTML =
      `<div class="field"><label for="czName">Nom de la campagne</label>
         <input id="czName" value="${esc(draft.name)}" maxlength="80"></div>
       <div class="field"><label for="czTpl">Partir d’un modèle</label>
         <select id="czTpl">${tpls.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}</select></div>
       <div class="field"><label for="czSubj">Objet</label><input id="czSubj" value="${esc(draft.subject)}"></div>
       <div class="field"><label for="czBody">Message (J0)</label>
         <textarea id="czBody" style="min-height:130px">${esc(draft.body)}</textarea></div>
       <details class="pcard pcard-details"><summary><h3>${ic('clock', 'ic-14')} Les deux relances — J+7 et J+14, figées</h3></summary>
         <div class="field"><label for="czR1">Relance 1 (7 jours après l’envoi)</label>
           <textarea id="czR1" style="min-height:90px">${esc(draft.r1)}</textarea></div>
         <div class="field"><label for="czR2">Relance 2 (7 jours après la relance 1)</label>
           <textarea id="czR2" style="min-height:90px">${esc(draft.r2)}</textarea></div>
       </details>
       <p class="hint">${ic('lock', 'ic-14')} La mention d’opposition est ajoutée à chaque message — obligatoire, elle ne se retire pas.</p>`;
    q('#czTpl').addEventListener('change', () => {
      const t = tpls[+q('#czTpl').value];
      if (t){ q('#czSubj').value = t.subject; q('#czBody').value = t.body; }
    });
    sh.setFoot([btn('Vérifier la campagne', 'btn-primary', async () => {
      draft.name = q('#czName').value.trim() || draft.name;
      draft.subject = q('#czSubj').value;
      draft.body = q('#czBody').value;
      draft.r1 = q('#czR1').value;
      draft.r2 = q('#czR2').value;
      if (!draft.subject.trim() || !draft.body.trim()){ toast('Un objet et un message — il manque l’un des deux.'); return; }
      await companionReady;
      stepControl();
    })]);
  };

  const stepControl = () => {
    const acct = mailAccount();
    const compAvailable = compAssoc || compRing;
    sh.setTitle('Vérifier la campagne');
    sh.body.innerHTML =
      `<div class="cz-recap">
         <b>${esc(draft.name)}</b>
         <div class="cz-lines">
           <span>${ic('contact', 'ic-14')} ${targets.length} piste${targets.length > 1 ? 's' : ''} · 1 message + 2 relances</span>
           <span>${ic('clock', 'ic-14')} ${DAILY_CAP} envois max par jour, ${SEND_WINDOW_TXT}</span>
           <span>${ic('check', 'ic-14')} S’arrête seule si on te répond</span>
           <span>${ic('mail', 'ic-14')} ${draft.auto
             ? 'Depuis <b>ton ordinateur</b> (Compagnon)'
             : (acct ? 'Depuis <b>' + esc(acct.email || 'ta messagerie') + '</b>' : '<em>Aucune messagerie connectée</em>')}</span>
         </div>
       </div>
       ${compAvailable ? `
       <div class="lbl-row" style="margin:10px 0 6px"><label>Qui appuie sur Envoyer ?</label></div>
       <div class="pick-list">
         <button class="pick${draft.auto ? '' : ' on'}" id="czManu" aria-pressed="${!draft.auto}">
           <b>Je valide chaque jour</b><span>tes envois t’attendent dans « Aujourd’hui »</span></button>
         <button class="pick${draft.auto ? ' on' : ''}" id="czAutoOpt" aria-pressed="${draft.auto}">
           <b>Mon ordinateur envoie tout seul</b><span>${compAssoc
             ? 'même app fermée — ' + esc(compAssoc.nom || 'Compagnon')
             : 'il prendra la campagne dès qu’il te rejoint'}</span></button>
       </div>
       <p class="hint" id="czCompEtat"></p>` : ''}
       <details class="pcard pcard-details"><summary><h3>${ic('eye', 'ic-14')} Voir les ${targets.length} emails remplis</h3></summary>
         ${targets.slice(0, 30).map(t =>
           `<div class="cz-preview"><b>${esc(t.who || t.name || t.email)}</b> · ${esc(t.company)}<br>
              <span class="cz-subj">${esc(fillTpl(draft.subject, t.companyObj, t, S.profile))}</span></div>`).join('')}
       </details>
       ${skipped.length ? `<p class="hint warn">${skipped.length} piste${skipped.length > 1 ? 's' : ''} sans email — écartée${skipped.length > 1 ? 's' : ''} : ${esc(skipped.map(c => c.name).join(', ').slice(0, 120))}</p>` : ''}
       ${acct || compAvailable ? '' : `<p class="hint warn" id="czCxHint">Connecte ta messagerie pour envoyer depuis l’app. <button class="linklike" id="czCx" style="min-height:0;padding:0 4px">Connecter</button></p>`}
       ${draft.auto ? '' : `<p class="hint">Rien ne part tout seul : chaque jour, tes envois prêts t’attendent dans « Aujourd’hui ».</p>`}
       ${compAvailable ? '' : `<p class="hint">${ic('lightbulb', 'ic-14')} Ton ordinateur peut envoyer même app fermée — <button class="linklike" id="czVoirComp" style="min-height:0;padding:0 4px">voir comment</button></p>`}`;
    q('#czCx')?.addEventListener('click', () => openConnexions());
    q('#czVoirComp')?.addEventListener('click', async () => {
      const { openAddCompanion } = await import('./compagnon.js');
      openAddCompanion(() => { Promise.all([loadCompanion(), ringCompanion()])
        .then(([a, r]) => { compAssoc = a; compRing = r; stepControl(); }); });
    });
    q('#czManu')?.addEventListener('click', () => { draft.auto = false; stepControl(); });
    q('#czAutoOpt')?.addEventListener('click', () => { draft.auto = true; stepControl(); });
    /* honnêteté : l'ordinateur est-il là, sa messagerie est-elle réglée ? */
    if (draft.auto && !compAssoc){
      const el = q('#czCompEtat');
      if (el) el.textContent = 'Ton ordinateur prendra la campagne dès qu’il te rejoint.';
    } else if (compAssoc && draft.auto){
      (async () => {
        const el = q('#czCompEtat');
        if (!el) return;
        const found = await probeCompanion();
        if (!found){ el.textContent = 'Ton ordinateur est éteint — la campagne partira à son réveil.'; return; }
        try {
          const pong = await companionCall(found.base, compAssoc.k, { t: 'ping' });
          el.textContent = pong && pong.messagerie === false
            ? 'Règle d’abord la messagerie dans la fenêtre du Compagnon.'
            : '';
        } catch (e) {}
      })();
    }
    const bOk = btn('Valider la campagne', 'btn-primary', async () => {
      if (!draft.auto && !mailAccount()){ toast('Connecte d’abord ta messagerie.'); return; }
      if (draft.auto && !(compAssoc || await ringCompanion())){
        draft.auto = false;
        toast('Aucun Compagnon n’est relié pour l’instant.');
        stepControl();
        return;
      }
      if (!await requireCode('Ton code, pour valider')) return;
      const c = buildCampaign({
        name: draft.name,
        from: (mailAccount() || {}).email || '',
        launchAt: todayISO(),
        profile: S.profile,
        steps: [
          { subject: draft.subject, body: draft.body },
          { subject: 'Re: ' + draft.subject, body: draft.r1 },
          { subject: 'Re: ' + draft.subject, body: draft.r2 }
        ],
        targets: targets.map(t => ({ cid: t.cid, name: t.name, role: t.role, email: t.email,
          company: t.company, companyObj: t.companyObj }))
      });
      c.auto = draft.auto;
      c.updatedAt = Date.now();
      campaigns = all().concat([c]);
      await save();
      for (const t of targets){
        const p = S.companies.find(x => x.id === t.cid);
        if (p) pushHist(p, 'Campagne « ' + c.name + ' » — ' + (c.auto ? 'confiée à ton ordinateur' : 'en file d’envoi'));
      }
      saveData();
      logJ('Campagne validée : ' + c.name + ' (' + targets.length + ' pistes' + (c.auto ? ', confiée' : '') + ')');
      if (c.auto){
        /* le bon signé part tout de suite si l'ordinateur répond,
           sinon il attend — la réconciliation le remettra */
        await loadMissions();
        try {
          const rec = await buildCampaignMission(c);
          missions.push(rec);
          await saveMissions();
          const ok = await remettreMission(rec);
          sh.close(null, true);
          bus.refresh();
          toast(ok ? 'Confiée à ton ordinateur ✓ — elle partira toute seule.'
                   : (compAssoc ? 'Prête — ton ordinateur la prendra à son réveil.'
                                : 'Prête — ton ordinateur la prendra dès qu’il te rejoint.'));
        } catch (e) {
          sh.close(null, true);
          bus.refresh();
          toast(compAssoc ? 'Prête — ton ordinateur la prendra à son réveil.'
                          : 'Prête — ton ordinateur la prendra dès qu’il te rejoint.');
        }
        return;
      }
      sh.close(null, true);
      bus.refresh();
      toast('Campagne prête ✓ — tes premiers envois t’attendent dans « Aujourd’hui ».');
    });
    /* Le bouton n'invite plus à une action impossible. Le lien « Connecter »
       juste au-dessus reste le geste disponible et explique le prérequis. */
    const canValidate = draft.auto || !!mailAccount();
    bOk.disabled = !canValidate;
    bOk.classList.toggle('btn-off', !canValidate);
    bOk.setAttribute('aria-disabled', String(!canValidate));
    if (!canValidate){
      bOk.setAttribute('aria-describedby', 'czCxHint');
      bOk.title = 'Connecte d’abord ta messagerie';
    }
    sh.setFoot([btn('← Le message', 'btn-ghost', stepMessage), bOk]);
  };

  if (!targets.length){
    sh.body.innerHTML = '<p class="cf-msg">Aucune de ces pistes n’a d’email — ajoute un contact avec email, ou passe par « Une par une » (copier vers LinkedIn).</p>';
    sh.setFoot([btn('Fermer', '', () => sh.close())]);
    return;
  }
  stepMessage();
}

/* ---------- la feuille du jour ---------- */
export function openCampaignDay(c0){
  let c = all().find(x => x.id === c0.id) || c0;
  const sh = openSheet({ title: c.name, icon: 'flag', clearToast: true });
  const q = s => sh.body.querySelector(s);
  const today = todayISO();
  let sending = false;

  const persist = async () => {
    c = touch(c);
    campaigns = all().map(x => x.id === c.id ? c : x);
    await save();
  };
  const sendOne = async d => {
    if (!inSendWindow(new Date())){ toast('Les envois partent ' + SEND_WINDOW_TXT + '.'); return false; }
    const acct = mailAccount();
    if (!acct){ toast('Connecte ta messagerie pour envoyer.'); openConnexions(); return false; }
    try {
      const token = await freshToken(acct.provider);
      await sendMail(acct.provider, token, { from: acct.email, to: d.email, subject: d.subject, body: d.body });
      c = markSent(c, d.sid, todayISO());
      const p = S.companies.find(x => x.id === d.cid);
      if (p){
        pushHist(p, 'Campagne « ' + c.name + ' » — ' + STEP_LABELS[d.step] + ' envoyée' + (d.who ? ' à ' + d.who : ''));
        if (p.status === 'todo') p.status = 'active';
        if (!p.appliedAt) p.appliedAt = todayISO();
        p.updatedAt = Date.now();
      }
      await persist();
      saveData();
      return true;
    } catch (e) {
      if (e.message === 'expire'){
        toast('Ta messagerie demande de te reconnecter.');
        openConnexions();
        return false;
      }
      c = markError(c, d.tid);
      await persist();
      toast('Pas parti pour ' + (d.who || d.email) + ' — marqué, jamais re-tenté en silence.');
      return true;   /* on continue la file */
    }
  };

  /* campagne confiée : l'ordinateur appuie — ici on regarde et on
     peut reprendre la main, jamais envoyer en double */
  const renderAuto = () => {
    const st = campaignStats(c);
    const closed = c.state === 'done' || c.state === 'stopped';
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 10px">${st.sent} envoyé${st.sent > 1 ? 's' : ''} · ${st.replied} réponse${st.replied > 1 ? 's' : ''} · ${st.targets} piste${st.targets > 1 ? 's' : ''}</p>
       ${closed
         ? `<p class="hint">${c.state === 'done' ? 'Terminée ✓' : 'Arrêtée.'}</p>`
         : `<p class="hint">${ic('zap', 'ic-14')} Confiée à ton ordinateur — les envois partent tout seuls (${DAILY_CAP}/jour, ${SEND_WINDOW_TXT}).</p>
            <p class="hint" id="czCompLive">${ic('clock', 'ic-14')} État de ton ordinateur…</p>
            <button class="linklike" id="czReprendre" style="margin-top:12px">Reprendre la main…</button>`}`;
    (async () => {
      const el = q('#czCompLive');
      if (!el) return;
      const assoc = await loadCompanion();
      const found = assoc && await probeCompanion();
      if (!found){ el.innerHTML = `${ic('clock', 'ic-14')} Ton ordinateur est éteint — il rattrapera à son réveil.`; return; }
      try {
        const pong = await companionCall(found.base, assoc.k, { t: 'ping' });
        el.innerHTML = pong && pong.messagerie === false
          ? `${ic('square-alert', 'ic-14')} Règle la messagerie dans la fenêtre du Compagnon — rien ne part sans elle.`
          : `${ic('radio', 'ic-14')} Ton ordinateur est prêt.`;
      } catch (e) { el.innerHTML = `${ic('clock', 'ic-14')} Ton ordinateur ne répond pas — il rattrapera.`; }
    })();
    q('#czReprendre')?.addEventListener('click', async () => {
      const okv = await confirmSheet({ title: 'Reprendre la main ?', okLabel: 'Reprendre', icon: 'switch',
        msg: 'Ton ordinateur arrête d’envoyer — s’il est éteint, il l’apprendra à son réveil. Ce qui est parti est au journal ; la suite t’attendra dans « Aujourd’hui ».' });
      if (!okv) return;
      if (!await requireCode('Ton code, pour reprendre')) return;
      await loadMissions();
      const rec = missionOf(c.id);
      try {
        const assoc = await loadCompanion();
        const found = assoc && await probeCompanion();
        if (found && rec){
          const r = await companionCall(found.base, assoc.k, { t: 'revoquer', mid: rec.mid });
          if (r && r.t === 'ok') rec.revOk = true;
          const rap = await companionCall(found.base, assoc.k, { t: 'rapport' });
          if (rap && Array.isArray(rap.journal)) await foldJournal(rap.journal);
        }
      } catch (e) {}
      if (rec){ rec.state = 'revoquee'; await saveMissions(); }
      c = all().find(x => x.id === c.id) || c;
      c = Object.assign({}, c, { auto: false });
      await persist();
      logJ('Campagne reprise en main : ' + c.name);
      render();
      bus.refresh();
    });
    sh.setFoot(null);
  };

  const render = () => {
    if (c.auto){ renderAuto(); return; }
    const st = campaignStats(c);
    const due = c.state === 'ready' ? dueFor(c, today) : [];
    const held = c.state === 'ready' ? dueSends(c, today).length - due.length : 0;
    const inWin = inSendWindow(new Date());
    const closed = c.state === 'done' || c.state === 'stopped';
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 10px">${st.sent} envoyé${st.sent > 1 ? 's' : ''} · ${st.replied} réponse${st.replied > 1 ? 's' : ''} · ${st.targets} piste${st.targets > 1 ? 's' : ''}${c.from ? ' · depuis ' + esc(c.from) : ''}</p>
       ${c.state === 'paused' ? `<p class="hint warn">En pause — rien ne part.</p>` : ''}
       ${closed ? `<p class="hint">${c.state === 'done' ? 'Terminée ✓' : 'Arrêtée.'} ${st.replied ? '' : 'Marque les réponses sur les fiches quand elles arrivent.'}</p>` : ''}
       ${due.length && !inWin ? `<p class="hint warn">Les envois partent ${SEND_WINDOW_TXT} — ils t’attendent ici.</p>` : ''}
       ${due.length ? `<div class="lbl-row"><label>Prêts aujourd’hui (${due.length})</label></div>` : ''}
       ${due.map(d =>
         `<details class="camp-send" data-sid="${esc(d.sid)}">
            <summary><span class="cs-m"><b>${esc(d.who || d.email)}</b>
              <span class="cs-sub">${esc(d.company)} · ${STEP_LABELS[d.step]}</span></span>
              <button class="btn btn-sm" data-send="${esc(d.sid)}"${inWin ? '' : ' disabled'}>Envoyer</button></summary>
            <div class="cs-body"><b>${esc(d.subject)}</b>\n\n${esc(d.body)}</div>
          </details>`).join('')}
       ${held > 0 ? `<p class="hint">${held} de plus demain — 15/jour, toutes campagnes confondues.</p>` : ''}
       ${!due.length && c.state === 'ready' ? `<p class="hint">${ic('check', 'ic-14')} C’est tout pour aujourd’hui — la suite viendra d’elle-même.</p>` : ''}
       ${!closed ? `<div style="margin-top:14px;display:flex;gap:10px">
          ${c.state === 'paused'
            ? `<button class="linklike" id="czResume">Reprendre</button>`
            : `<button class="linklike" id="czPause">Mettre en pause</button>`}
          <button class="linklike" id="czStop" style="color:var(--red)">Arrêter la campagne…</button>
        </div>` : ''}
       ${closed && st.active === 0 && st.replied < st.targets
         ? `<button class="linklike" id="czNoReply">Voir les pistes sans réponse →</button>` : ''}`;
    sh.body.querySelectorAll('[data-send]').forEach(b =>
      b.addEventListener('click', async e => {
        e.preventDefault();
        if (sending) return;
        sending = true;
        b.disabled = true;
        b.textContent = 'Envoi…';
        const d = dueFor(c, today).find(x => x.sid === b.dataset.send);
        if (d) await sendOne(d);
        sending = false;
        render();
        bus.refresh();
      }));
    q('#czPause')?.addEventListener('click', async () => {
      c = pauseCampaign(c);
      await persist();
      logJ('Campagne en pause : ' + c.name);
      render();
      bus.refresh();
    });
    q('#czResume')?.addEventListener('click', async () => {
      c = resumeCampaign(c);
      await persist();
      render();
      bus.refresh();
    });
    q('#czStop')?.addEventListener('click', async () => {
      const okv = await confirmSheet({ title: 'Arrêter la campagne ?', danger: true, okLabel: 'Arrêter', icon: 'flag',
        msg: 'Plus aucun envoi ne partira. Ce qui est parti est parti — les fiches gardent leur historique.' });
      if (!okv) return;
      c = stopCampaign(c);
      c.ack = true;
      await persist();
      logJ('Campagne arrêtée : ' + c.name);
      render();
      bus.refresh();
    });
    q('#czNoReply')?.addEventListener('click', () => { sh.close(); location.hash = '#/pistes'; });
    /* le bilan d'une campagne finie ne se rappelle qu'une fois */
    if (closed && !c.ack){ c.ack = true; persist(); }
    if (c.state === 'ready' && campaignStats(c).replied && !c.ackR){ c.ackR = true; persist(); }
    const due2 = (c.state === 'ready' && inWin) ? dueFor(c, today) : [];
    sh.setFoot(due2.length > 1
      ? [btn(`Tout envoyer (${due2.length})`, 'btn-primary', async () => {
          if (sending) return;
          sending = true;
          for (const d of dueFor(c, today)){
            const cont = await sendOne(d);
            if (!cont) break;
          }
          sending = false;
          render();
          bus.refresh();
          const left = dueFor(c, today).length;
          toast(left ? 'Fait ce qui pouvait l’être — ' + left + ' restant.' : 'Envois du jour faits ✓');
        }, 'mail')]
      : null);
  };
  render();
  /* fraîcheur : replier le journal du Compagnon puis re-peindre */
  if (c.auto) reconcileCompanion().then(() => {
    c = all().find(x => x.id === c.id) || c;
    if (sh.body.isConnected) render();
  }).catch(() => {});
}
