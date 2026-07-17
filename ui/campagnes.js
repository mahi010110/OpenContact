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
import { CAMPAIGNS_KEY, kvGet, kvSet } from '../engine/storage.js';
import { S, bus, saveData, logJ, isClosed } from './state.js';
import { openSheet, confirmSheet, toast, btn, ic } from './dom.js';
import { mailAccount, freshToken, openConnexions } from './connexions.js';
import { requireCode } from './verrou.js';

let campaigns = null;

export async function loadCampaigns(){
  try { campaigns = JSON.parse(await kvGet(CAMPAIGNS_KEY) || '[]') || []; }
  catch (e) { campaigns = []; }
  return campaigns;
}
const save = () => kvSet(CAMPAIGNS_KEY, JSON.stringify(campaigns || []));
const all = () => campaigns || [];
const live = () => all().filter(c => c.state === 'ready' || c.state === 'paused');
/* les envois dus de CETTE campagne, sous le plafond GLOBAL (15/j
   toutes campagnes) — la seule liste que l'écran a le droit d'offrir */
const dueFor = (c, today) => dueSendsAll(all().map(x => x.id === c.id ? c : x), today)
  .filter(d => d.cpId === c.id);

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
    return cc;
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
    if (c.state === 'ready'){
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
  const draft = {
    name: 'Prospection — ' + monthName(),
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
    sh.setFoot([btn('Vérifier la campagne', 'btn-primary', () => {
      draft.name = q('#czName').value.trim() || draft.name;
      draft.subject = q('#czSubj').value;
      draft.body = q('#czBody').value;
      draft.r1 = q('#czR1').value;
      draft.r2 = q('#czR2').value;
      if (!draft.subject.trim() || !draft.body.trim()){ toast('Un objet et un message — il manque l’un des deux.'); return; }
      stepControl();
    })]);
  };

  const stepControl = () => {
    const acct = mailAccount();
    sh.setTitle('Vérifier la campagne');
    sh.body.innerHTML =
      `<div class="cz-recap">
         <b>${esc(draft.name)}</b>
         <div class="cz-lines">
           <span>${ic('contact', 'ic-14')} ${targets.length} piste${targets.length > 1 ? 's' : ''} · 1 message + 2 relances</span>
           <span>${ic('clock', 'ic-14')} ${DAILY_CAP} envois max par jour, ${SEND_WINDOW_TXT}</span>
           <span>${ic('check', 'ic-14')} S’arrête seule si on te répond</span>
           <span>${ic('mail', 'ic-14')} ${acct ? 'Depuis <b>' + esc(acct.email || 'ta messagerie') + '</b>' : '<em>Aucune messagerie connectée</em>'}</span>
         </div>
       </div>
       <details class="pcard pcard-details"><summary><h3>${ic('eye', 'ic-14')} Voir les ${targets.length} emails remplis</h3></summary>
         ${targets.slice(0, 30).map(t =>
           `<div class="cz-preview"><b>${esc(t.who || t.name || t.email)}</b> · ${esc(t.company)}<br>
              <span class="cz-subj">${esc(fillTpl(draft.subject, t.companyObj, t, S.profile))}</span></div>`).join('')}
       </details>
       ${skipped.length ? `<p class="hint warn">${skipped.length} piste${skipped.length > 1 ? 's' : ''} sans email — écartée${skipped.length > 1 ? 's' : ''} : ${esc(skipped.map(c => c.name).join(', ').slice(0, 120))}</p>` : ''}
       ${acct ? '' : `<p class="hint warn">Connecte ta messagerie pour envoyer depuis l’app. <button class="linklike" id="czCx" style="min-height:0;padding:0 4px">Connecter</button></p>`}
       <p class="hint">Rien ne part tout seul : chaque jour, tes envois prêts t’attendent dans « Aujourd’hui ».</p>
       <p class="hint">${ic('lightbulb', 'ic-14')} Ton ordinateur pourra bientôt envoyer même app fermée — le Compagnon arrive.</p>`;
    q('#czCx')?.addEventListener('click', () => openConnexions());
    const bOk = btn('Valider la campagne', 'btn-primary', async () => {
      if (!mailAccount()){ toast('Connecte d’abord ta messagerie.'); return; }
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
      campaigns = all().concat([c]);
      await save();
      for (const t of targets){
        const p = S.companies.find(x => x.id === t.cid);
        if (p) pushHist(p, 'Campagne « ' + c.name + ' » — en file d’envoi');
      }
      saveData();
      logJ('Campagne validée : ' + c.name + ' (' + targets.length + ' pistes)');
      sh.close(null, true);
      bus.refresh();
      toast('Campagne prête ✓ — tes premiers envois t’attendent dans « Aujourd’hui ».');
    });
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
  const sh = openSheet({ title: c.name, icon: 'flag' });
  const q = s => sh.body.querySelector(s);
  const today = todayISO();
  let sending = false;

  const persist = async () => {
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

  const render = () => {
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
}
