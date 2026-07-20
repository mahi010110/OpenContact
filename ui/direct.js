/* ============================================================
   OpenContact — interface · le DIRECT (P2P, WebRTC via Trystero)
   Deux mondes bien distincts, jamais mélangés :
   · « Mes appareils » — le lien est PERSISTANT : synclive.js garde
     la connexion en arrière-plan tant que la phrase existe. Cette
     feuille n'est que le poste de gestion : statut, dernier lot
     reçu, profil à reprendre, appareils reliés, rompre le lien.
   · « Partage en groupe » — un mot de passe de GROUPE ; seules les
     fiches partageables circulent (sharePayload), avec le même
     aperçu avant fusion que par fichier. Bêta discrète.
   ============================================================ */
import { esc } from '../engine/utils.js';
import { fnv } from '../engine/crypto.js';
import { sharePayload } from '../engine/exchange.js';
import { PROMO_KEY, RELAYS_KEY, kvGet, kvSet } from '../engine/storage.js';
import { S, bus, isClosed, logJ } from './state.js';
import { openSheet, confirmSheet, toast, btn, ic } from './dom.js';
import { mergePreviewInto } from './recevoir.js';
import { getSync, startSync, breakLink, keepMyProfile, makePhrase, openRoom,
         deviceSelf, loadDevices, removeDevice, DEVICES_MAX,
         getRing, amMain, ringDo, ringMakeMain } from './synclive.js';
import { deviceIn } from '../engine/ring.js';
import { requireCode } from './verrou.js';
import { loadCompanion, openAddCompanion, openCompanionSheet, openCompanionPhoneSheet, companionPresence } from './compagnon.js';

const isDesktop = () => matchMedia('(min-width:901px)').matches;
const relayList = async () => {
  try {
    const urls = JSON.parse(await kvGet(RELAYS_KEY) || '[]');
    return Array.isArray(urls) ? urls.filter(x => typeof x === 'string').slice(0, 8) : [];
  } catch (e) { return []; }
};
const relaySettingsHTML = urls =>
  `<details class="pcard pcard-details sy-relays" style="margin-top:14px">
     <summary><h3>${ic('settings-2', 'ic-14')} Connexion avancée</h3></summary>
     <p class="hint">Seulement si ton réseau bloque la liaison. Une adresse sécurisée <b>wss://</b> par ligne.</p>
     <div class="field"><label for="syRelays">Relais personnalisés</label>
       <textarea id="syRelays" class="ta-s" spellcheck="false" autocapitalize="off"
         placeholder="wss://relais.exemple.org">${esc(urls.join('\n'))}</textarea></div>
     <button class="btn btn-sm" id="sySaveRelays">Enregistrer</button>
     <button class="linklike" id="syPublicRelays"${urls.length ? '' : ' hidden'}>Revenir aux relais publics</button>
   </details>`;
function parseRelays(raw){
  const values = String(raw || '').split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
  if (values.length > 8) throw new Error('huit');
  const out = [];
  for (const value of values){
    let u;
    try { u = new URL(value); } catch (e) { throw new Error('adresse'); }
    if (u.protocol !== 'wss:' || !u.hostname || u.username || u.password) throw new Error('adresse');
    if (!out.includes(u.href)) out.push(u.href);
  }
  return out;
}
function wireRelays(q, phrase, rerender){
  const save = async urls => {
    await kvSet(RELAYS_KEY, JSON.stringify(urls));
    if (phrase) await startSync(phrase);
    toast(urls.length
      ? 'Relais enregistrés — la liaison redémarre.'
      : 'Relais publics rétablis.');
    rerender();
  };
  q('#sySaveRelays')?.addEventListener('click', async () => {
    try { await save(parseRelays(q('#syRelays').value)); }
    catch (e) { toast(e.message === 'huit' ? 'Huit relais maximum.' : 'Adresse attendue : wss://…'); }
  });
  q('#syPublicRelays')?.addEventListener('click', () => save([]));
}
/* la ligne Compagnon — présente avec ou sans phrase de liaison */
const compRowHTML = comp => comp
  ? `<button class="dev-row dev-open" id="devComp"><b>${esc(comp.nom || 'Compagnon')}</b> <span class="tag-beta">compagnon</span>
       <span class="dev-sub" id="devCompSub">état… · gérer ›</span></button>`
  : '';
function wireComp(q, comp, render){
  q('#devAddComp')?.addEventListener('click', () => openAddCompanion(render));
  q('#devCompInfo')?.addEventListener('click', () => openCompanionPhoneSheet());
  if (!comp) return;
  q('#devComp')?.addEventListener('click', () => openCompanionSheet(comp, render));
  companionPresence().then(p => {
    const el = q('#devCompSub');
    if (el) el.textContent = (p && p.state === 'on' ? 'prêt' : 'éteint') + ' · gérer ›';
  });
}

const agoLabel = t => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return 'à l’instant';
  if (m < 60) return 'il y a ' + m + ' min';
  const h = Math.round(m / 60);
  if (h < 24) return 'il y a ' + h + ' h';
  return 'il y a ' + Math.round(h / 24) + ' j';
};

/* ---------- feuille d'un appareil : les commandes du principal ----------
   Chaque geste re-demande le code ; la commande voyage dans l'anneau
   signé et s'applique quand l'appareil se reconnecte — l'interface
   est honnête sur cette limite. */
function openDeviceSheet(d, onDone){
  const sh = openSheet({ title: d.name, icon: 'switch' });
  sh.body.innerHTML =
    `<p class="hint" style="margin:0 0 10px">Vu ${agoLabel(d.seen || 0)}. Une commande s’applique quand il se reconnecte.</p>
     <div class="pick-list">
       <button class="pick" id="dvLock"><b>Verrouiller cet appareil</b><span>il se verrouillera dès qu’il se reconnectera</span></button>
       <button class="pick" id="dvMain"><b>En faire l’appareil principal</b><span>celui-ci redevient un appareil ordinaire</span></button>
       <button class="pick" id="dvRemove"><b>Retirer de mes appareils</b><span>il ne se synchronisera plus</span></button>
       <button class="pick" id="dvBan"><b>Retirer et changer les clés</b><span>appareil perdu ou douteux</span></button>
       <button class="pick pick-danger" id="dvWipe"><b>Effacer ses données</b><span>de bonne foi — à sa prochaine connexion</span></button>
     </div>`;
  const q = s => sh.body.querySelector(s);
  const doCmd = async (cmd, confirmOpts, doneMsg) => {
    if (confirmOpts && !await confirmSheet(confirmOpts)) return;
    if (!await requireCode('Ton code, pour confirmer')) return;
    if (cmd === 'main') await ringMakeMain(d.id);
    else await ringDo(cmd, d.id);
    sh.close(null, true);
    toast(doneMsg);
    onDone();
  };
  q('#dvLock').addEventListener('click', () =>
    doCmd('lock', null, 'Il se verrouillera dès qu’il se reconnectera.'));
  q('#dvMain').addEventListener('click', () =>
    doCmd('main', { title: 'Transférer le rôle ?', okLabel: 'Transférer', icon: 'switch',
      msg: `<b>${esc(d.name)}</b> devient ton appareil principal. Celui-ci redevient un appareil ordinaire.` },
      'Rôle transféré ✓'));
  q('#dvRemove').addEventListener('click', () =>
    doCmd('remove', { title: 'Retirer cet appareil ?', danger: true, okLabel: 'Retirer', icon: 'trash',
      msg: `<b>${esc(d.name)}</b> sort de tes appareils et ne se synchronisera plus. Rien n’y est effacé.` },
      'Retiré — il l’apprendra à sa prochaine connexion.'));
  q('#dvBan').addEventListener('click', () =>
    doCmd('ban', { title: 'Retirer et changer les clés ?', danger: true, okLabel: 'Retirer', icon: 'trash',
      msg: `<b>${esc(d.name)}</b> est écarté et les clés du groupe changent. Il connaît encore la phrase de liaison — <b>change-la aussi</b> pour l’écarter vraiment.` },
      'Écarté. Pense à changer la phrase de liaison.'));
  q('#dvWipe').addEventListener('click', () =>
    doCmd('wipe', { title: 'Effacer ses données ?', danger: true, okLabel: 'Effacer', icon: 'square-alert',
      msg: `<b>${esc(d.name)}</b> effacera ses données OpenContact à sa prochaine connexion. Si quelqu’un l’en empêche, change aussi les clés et la phrase.` },
      'Demandé — il effacera à sa prochaine connexion.'));
}

/* ============ Mes appareils : gestion du lien persistant ============ */
export function openAppareils(){
  let onSync = null;
  const sh = openSheet({
    title: 'Mes appareils', icon: 'switch', clearToast: true,
    onClose: () => { if (onSync){ document.removeEventListener('oc:sync', onSync); onSync = null; } }
  });
  const q = s => sh.body.querySelector(s);

  const statusHTML = () => {
    const sy = getSync();
    if (sy.state === 'on')
      return `${ic('radio', 'ic-14')} <b>${sy.peers}</b> appareil${sy.peers > 1 ? 's' : ''} en face — à jour en continu`;
    if (sy.state === 'wait')
      return `${ic('clock', 'ic-14')} En liaison — les autres appareils se connecteront tout seuls`;
    if (sy.state === 'err')
      return `${ic('square-alert', 'ic-14')} Pas de connexion — réseau bloqué ? <button class="btn btn-sm" id="syRetry">Réessayer</button>`;
    return `${ic('clock', 'ic-14')} Connexion…`;
  };

  /* le rôle d'un appareil dans l'anneau — '' si pas d'anneau */
  const roleOf = id => {
    const r = getRing();
    const d = r && deviceIn(r, id);
    return d ? (r.main === id ? 'main' : d.role) : '';
  };
  const roleTag = id => {
    const role = roleOf(id);
    if (role === 'main') return ' <span class="tag-main">principal</span>';
    if (role === 'companion') return ' <span class="tag-beta">compagnon</span>';
    return '';
  };

  async function renderLinked(){
    const sy = getSync();
    const self = await deviceSelf();
    const devs = await loadDevices();
    const st = sy.lastStats;
    const iAmMain = await amMain();
    const comp = await loadCompanion();
    const relays = await relayList();
    sh.setTitle('Mes appareils');
    sh.body.innerHTML =
      `<div class="sy-phrase"><span>${esc(sy.phrase)}</span></div>
       <p class="hint" style="text-align:center">Sur l’autre appareil : <b>Moi → Mes appareils → Entrer une phrase</b>.</p>
       <div class="sy-status" id="syStatus">${statusHTML()}</div>
       <div class="sy-log">${st ? `
         <ul class="rc-lines">
           ${st.addedC ? `<li>${ic('plus', 'ic-14')} <b>${st.addedC}</b> reçue${st.addedC > 1 ? 's' : ''}</li>` : ''}
           ${st.updatedC ? `<li>${ic('pencil', 'ic-14')} <b>${st.updatedC}</b> mise${st.updatedC > 1 ? 's' : ''} à jour</li>` : ''}
           ${st.removedC ? `<li>${ic('trash', 'ic-14')} <b>${st.removedC}</b> supprimée${st.removedC > 1 ? 's' : ''}</li>` : ''}
           ${st.addedO ? `<li>${ic('contact', 'ic-14')} <b>${st.addedO}</b> contact${st.addedO > 1 ? 's' : ''} à rattacher</li>` : ''}
           ${st.profile === 'remote' ? `<li>${ic('user', 'ic-14')} profil : la version la plus récente a été prise
              ${sy.prevProfile ? '<button class="btn btn-sm" id="syKeepProf">Garder plutôt la mienne</button>' : ''}</li>` : ''}
         </ul>` : ''}</div>
       <div class="sy-devs">
         <div class="lbl-row" style="margin-bottom:6px"><label>Appareils reliés</label></div>
         <div class="dev-row"><b>${esc(self.name)}</b>${roleTag(self.id)}<span class="dev-sub">cet appareil</span></div>
         ${devs.map(d => iAmMain && roleOf(d.id)
           ? `<button class="dev-row dev-open" data-dev="${esc(d.id)}"><b>${esc(d.name)}</b>${roleTag(d.id)}
                <span class="dev-sub">${agoLabel(d.seen || 0)} · gérer ›</span></button>`
           : `<div class="dev-row"><b>${esc(d.name)}</b>${roleTag(d.id)}<span class="dev-sub">${agoLabel(d.seen || 0)}</span>
                <button class="abtn abtn-sm" data-rm="${esc(d.id)}" aria-label="Retirer ${esc(d.name)}" title="Retirer">${ic('trash', 'ic-14')}</button>
              </div>`).join('')}
         ${comp ? compRowHTML(comp)
           : (iAmMain
             ? (isDesktop()
               ? `<button class="linklike" id="devAddComp" style="margin-top:6px">${ic('plus', 'ic-14')} Ajouter le Compagnon — cet ordinateur enverra même app fermée</button>`
               : `<button class="dev-row dev-open" id="devCompInfo"><b>Le Compagnon</b><span class="dev-sub">s’installe et s’associe depuis ton ordinateur · voir ›</span></button>`)
             : '')}
         ${getRing() && !iAmMain ? `<p class="hint" style="margin-top:6px">Seul ton appareil principal peut gérer les autres.</p>` : ''}
         ${1 + devs.length > DEVICES_MAX
           ? `<p class="hint warn" style="margin-top:6px">Plus de ${DEVICES_MAX} appareils — change la phrase de liaison pour écarter ceux que tu ne reconnais pas.</p>`
           : ''}
       </div>
       ${relaySettingsHTML(relays)}
       <button class="linklike" id="syNewPhrase" style="margin-top:12px">Changer la phrase de liaison</button>`;

    q('#syRetry')?.addEventListener('click', () => startSync(sy.phrase));
    q('#syKeepProf')?.addEventListener('click', keepMyProfile);
    q('#syNewPhrase')?.addEventListener('click', async () => {
      if (await requireCode('Ton code, pour changer la phrase')) renderStart(true);
    });
    sh.body.querySelectorAll('[data-rm]').forEach(b =>
      b.addEventListener('click', async () => {
        const d = devs.find(x => x.id === b.dataset.rm);
        const ok = await confirmSheet({
          title: 'Retirer cet appareil ?', danger: true, okLabel: 'Retirer', icon: 'trash',
          msg: `<b>${esc(d ? d.name : 'Appareil')}</b> sort de la liste. Il connaît encore la phrase — pour l’écarter vraiment, change aussi la phrase de liaison.`
        });
        if (!ok) return;
        if (!await requireCode('Ton code, pour retirer')) return;
        await removeDevice(b.dataset.rm);
        render();
      }));
    /* je suis le principal : chaque appareil s'ouvre en feuille de gestion */
    sh.body.querySelectorAll('[data-dev]').forEach(b =>
      b.addEventListener('click', () => {
        const d = devs.find(x => x.id === b.dataset.dev);
        if (d) openDeviceSheet(d, render);
      }));
    wireComp(q, comp, render);
    wireRelays(q, sy.phrase, render);
    sh.setFoot([
      btn('Rompre le lien', 'btn-ghost', async () => {
        const ok = await confirmSheet({
          title: 'Rompre le lien ?', danger: true, okLabel: 'Rompre', icon: 'switch',
          msg: 'Cet appareil ne se synchronisera plus. Rien n’est effacé — tes pistes restent ici, les autres appareils gardent les leurs.'
        });
        if (!ok) return;
        if (!await requireCode('Ton code, pour rompre le lien')) return;
        await breakLink();
        toast('Lien rompu — cet appareil vit sa vie.');
        render();
      })
    ]);
  }

  async function renderStart(changing){
    const comp = await loadCompanion();
    const relays = await relayList();
    sh.setTitle('Mes appareils');
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 12px">${changing
         ? 'Nouvelle phrase = nouveau lien — à retaper sur les autres appareils.'
         : 'Une phrase de liaison, et tes appareils restent à jour — suivi compris.'}</p>
       <div class="pick-list">
         <button class="pick" id="syNew"><b>${ic('sparkles', 'ic-14')} Créer une phrase</b><span>je commence ici</span></button>
         <button class="pick" id="syJoin"><b>${ic('switch', 'ic-14')} Entrer une phrase</b><span>j’en ai déjà une</span></button>
       </div>
       ${comp ? `<div class="sy-devs" style="margin-top:14px">
           <div class="lbl-row" style="margin-bottom:6px"><label>Appareils reliés</label></div>
           ${compRowHTML(comp)}
         </div>` : ''}
       ${!changing && !comp && isDesktop()
         ? `<button class="linklike" id="devAddComp" style="margin-top:12px">${ic('plus', 'ic-14')} Ajouter le Compagnon — cet ordinateur enverra même app fermée</button>`
         : ''}
       ${!changing && !comp && !isDesktop()
         ? `<div class="sy-devs"><button class="dev-row dev-open" id="devCompInfo"><b>Le Compagnon</b><span class="dev-sub">s’installe et s’associe depuis ton ordinateur · voir ›</span></button></div>`
         : ''}
       ${relaySettingsHTML(relays)}`;
    sh.setFoot(changing ? [btn('← Retour', 'btn-ghost', render)] : null);
    wireComp(q, comp, render);
    wireRelays(q, '', render);
    q('#syNew').addEventListener('click', () => { startSync(makePhrase()); render(); });
    q('#syJoin').addEventListener('click', () => {
      sh.body.innerHTML =
        `<div class="field"><label for="syPhrase">Phrase de l’autre appareil</label>
           <input id="syPhrase" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ex : k7m3p-9xq2f"></div>`;
      const go = () => {
        const v = q('#syPhrase').value.trim().toLowerCase();
        if (v){ startSync(v); render(); }
      };
      q('#syPhrase').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      sh.setFoot([btn('← Retour', 'btn-ghost', () => renderStart(changing)), btn('Relier', 'btn-primary', go)]);
      q('#syPhrase').focus();
    });
  }

  function render(){
    if (getSync().phrase) renderLinked();
    else renderStart(false);
  }
  /* l'état vivant pilote la feuille : peers, appareils, lot reçu… */
  onSync = () => { if (!sh.body.querySelector('#syPhrase')) render(); };
  document.addEventListener('oc:sync', onSync);
  render();
}

/* ============ Partage en groupe : communautaire, en direct ============ */
export function openPromo(){
  let room = null;
  let peers = 0;
  const queue = [];         /* payloads reçus, présentés un par un */
  const seen = new Set();   /* le même envoi ne se représente pas */
  let showing = false;
  const leave = () => { if (room){ try { room.leave(); } catch (e) {} room = null; } };
  const sh = openSheet({ title: 'Partage en groupe', icon: 'radio', onClose: leave });
  const q = s => sh.body.querySelector(s);

  const ask = async () => {
    const last = (await kvGet(PROMO_KEY)) || '';
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 12px">Un mot de passe pour le groupe (ta promo, ta classe), et les fiches circulent en direct — <b>jamais ton suivi privé</b>.</p>
       <div class="field"><label for="prPass">Mot de passe du groupe</label>
         <input id="prPass" autocomplete="off" autocapitalize="off" placeholder="ex : promo-sio-2026" value="${esc(last)}"></div>`;
    const go = () => { const v = q('#prPass').value.trim(); if (v){ kvSet(PROMO_KEY, v); enter(v); } };
    q('#prPass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    sh.setFoot([btn('Entrer', 'btn-primary', go)]);
    q('#prPass').focus();
  };

  async function enter(pass){
    sh.body.innerHTML =
      `<div class="sy-status" id="prStatus">${ic('radio', 'ic-14')} Connexion…</div>
       <div id="prZone"></div>
       <p class="hint" id="prHint" style="text-align:center">Chacun garde la feuille ouverte ; chaque envoi montre un aperçu avant fusion.</p>`;
    sh.setFoot([btn('Quitter le groupe', 'btn-ghost', () => { leave(); ask(); })]);
    const setStatus = txt => { const el = q('#prStatus'); if (el) el.innerHTML = txt; };
    try {
      room = await openRoom('promo', pass);   /* préfixe historique — compat */
    } catch (e) {
      setStatus(`${ic('square-alert', 'ic-14')} Pas de connexion — réseau bloqué ? Le fichier .oc marche toujours.`);
      return;
    }
    const share = room.makeAction('share');

    const mine = () => S.companies.filter(c => !isClosed(c) && !c.demo);
    /* ce qui part : tout par défaut, élagable d'un tap */
    const unsel = new Set();
    const chosen = () => mine().filter(c => !unsel.has(c.id));
    let choosing = false;
    const refreshStatus = () => {
      const n = chosen().length;
      setStatus(peers
        ? `${ic('radio', 'ic-14')} <b>${peers}</b> camarade${peers > 1 ? 's' : ''} dans le groupe`
        : `${ic('clock', 'ic-14')} Personne d’autre pour l’instant…`);
      const zone = q('#prZone');
      if (!zone) return;
      if (!peers || !mine().length){ zone.innerHTML = ''; return; }
      zone.innerHTML =
        `<button class="btn btn-primary pr-send" id="prSend"${n ? '' : ' disabled'}>${ic('share', 'ic-14')} Envoyer ${n ? n + ' piste' + (n > 1 ? 's' : '') : '…'}</button>
         <button class="linklike" id="prPick" style="margin-top:6px">${choosing ? 'Replier la liste' : 'Choisir ce qui part…'}</button>
         ${choosing ? `<div class="pick-list" style="margin-top:8px">
           ${mine().map(c =>
             `<button class="pick pk${unsel.has(c.id) ? '' : ' on'}" data-id="${c.id}" aria-pressed="${!unsel.has(c.id)}">
                ${ic('checkbox', 'ic-20 ic-off')}${ic('checkbox-on', 'ic-20 ic-on')}
                <div class="pk-m"><b>${esc(c.name)}</b>${c.city ? `<span>${esc(c.city)}</span>` : ''}</div>
              </button>`).join('')}
         </div>` : ''}`;
      q('#prSend').addEventListener('click', () => {
        const list = chosen();
        if (!list.length) return;
        share.send(sharePayload(list));
        logJ('Donné (partage en groupe) : ' + list.length + ' piste(s)');
        toast('Parti vers ' + peers + ' camarade' + (peers > 1 ? 's' : '') + ' ✓');
      });
      q('#prPick').addEventListener('click', () => { choosing = !choosing; refreshStatus(); });
      zone.querySelectorAll('.pk').forEach(b =>
        b.addEventListener('click', () => {
          const id = b.dataset.id;
          unsel.has(id) ? unsel.delete(id) : unsel.add(id);
          b.classList.toggle('on', !unsel.has(id));
          b.setAttribute('aria-pressed', !unsel.has(id));
          const n2 = chosen().length;
          const send = q('#prSend');
          send.disabled = !n2;
          send.innerHTML = `${ic('share', 'ic-14')} Envoyer ${n2 ? n2 + ' piste' + (n2 > 1 ? 's' : '') : '…'}`;
        }));
    };
    const showNext = () => {
      if (showing || !queue.length) return;
      showing = true;
      const { obj, from } = queue.shift();
      const psh = openSheet({ title: 'Reçu en direct', icon: 'inbox', onClose: () => { showing = false; showNext(); } });
      mergePreviewInto(psh, obj, { from, onCancel: () => psh.close() });
    };
    share.onMessage = (obj, meta) => {
      if (!obj || obj.kind !== 'share' || !Array.isArray(obj.companies)) return;
      obj.companies = obj.companies.filter(x => x && typeof x === 'object' && x.name).slice(0, 2000);
      if (!obj.companies.length) return;
      /* le même envoi (re-clic, rediffusion) ne réapparaît pas —
         une empreinte, pas le JSON entier : 30 envois retenus ne
         doivent pas peser 120 Mo. Envoi obèse refusé comme par
         fichier (D4, 4 Mo). */
      const json = JSON.stringify(obj.companies);
      if (json.length > 4000000) return;
      const key = json.length + ':' + fnv(json).toString(36);
      if (seen.has(key)) return;
      seen.add(key);
      if (seen.size > 30) seen.delete(seen.values().next().value);
      queue.push({ obj, from: 'camarade ' + String((meta && meta.peerId) || '').slice(0, 4) });
      showNext();
    };
    room.onPeerJoin = () => { peers++; refreshStatus(); };
    room.onPeerLeave = () => { peers = Math.max(0, peers - 1); refreshStatus(); };
    refreshStatus();
  }
  ask();
}
