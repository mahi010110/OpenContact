/* ============================================================
   OpenContact — interface · le Compagnon (association, présence)
   « Ton ordinateur qui travaille pour toi » — jamais de jargon
   (D4). L'association se fait depuis l'ordinateur : la fenêtre du
   Compagnon affiche un code court, on le recopie ici. La feuille
   vit dans « Mes appareils » ; l'état se lit comme un appareil :
   prêt / éteint. Exige le profil protégé (D9) et l'appareil
   principal (c'est lui qui signe l'anneau).
   ============================================================ */
import { esc } from '../engine/utils.js';
import { COMPANION_KEY, kvGet, kvSet, kvDel } from '../engine/storage.js';
import { probeCompanion, pairCompanion, companionCall, normCode } from '../engine/companion.js';
import { bus, logJ } from './state.js';
import { openSheet, confirmSheet, toast, btn, ic } from './dom.js';
import { deviceSelf, ensureKeys, getRing, amMain, ringDo, ringAddCompanion } from './synclive.js';
import { isProtected, requireCode, openProtectFlow } from './verrou.js';

export async function loadCompanion(){
  try { return JSON.parse(await kvGet(COMPANION_KEY) || 'null'); }
  catch (e) { return null; }   /* verrou : pas d'association lisible */
}

/* l'état vivant : prêt (répond sous la clé de canal) / éteint */
export async function companionPresence(){
  const assoc = await loadCompanion();
  if (!assoc) return null;
  const found = await probeCompanion();
  if (!found) return { assoc, state: 'off' };
  try {
    const pong = await companionCall(found.base, assoc.k, { t: 'ping' });
    return pong && pong.t === 'pong'
      ? { assoc, state: 'on', base: found.base }
      : { assoc, state: 'off' };
  } catch (e) { return { assoc, state: 'off' }; }
}

/* ---------- la feuille d'association ---------- */
export function openAddCompanion(onDone){
  const sh = openSheet({ title: 'Ajouter le Compagnon', icon: 'switch', focus: '.x' });
  const q = s => sh.body.querySelector(s);

  const stepIntro = async () => {
    if (!isProtected()){
      sh.body.innerHTML =
        `<p class="hint" style="margin:0 0 12px">Le Compagnon garde des accès sensibles :
           protège d’abord tes données — un code, une phrase, deux minutes.</p>`;
      sh.setFoot([btn('Protéger mes données', 'btn-primary', () => { sh.close(); openProtectFlow(); })]);
      return;
    }
    if (!(await amMain())){
      sh.body.innerHTML =
        `<p class="hint" style="margin:0 0 12px">Seul ton appareil principal peut associer le Compagnon.</p>`;
      sh.setFoot([btn('Fermer', '', () => sh.close())]);
      return;
    }
    sh.body.innerHTML =
      `<div class="pick-list">
         <div class="lk-why">${ic('zap', 'ic-14')} <span>Tes campagnes partent même app fermée.</span></div>
         <div class="lk-why">${ic('mail', 'ic-14')} <span>Les réponses arrêtent les relances toutes seules.</span></div>
         <div class="lk-why">${ic('shield', 'ic-14')} <span>Tes accès restent dans le trousseau de l’ordinateur.</span></div>
       </div>
       <p class="hint">Installe le Compagnon sur cet ordinateur, ouvre-le, puis
          clique « Afficher le code » dans sa fenêtre.</p>`;
    sh.setFoot([btn('Je l’ai ouvert — chercher', 'btn-primary', stepProbe)]);
  };

  const stepProbe = async () => {
    sh.body.innerHTML = `<p class="hint" style="margin:12px 0">Recherche sur cet ordinateur…</p>`;
    sh.setFoot(null);
    const found = await probeCompanion();
    if (!found){
      sh.body.innerHTML =
        `<p class="hint warn" style="margin:0 0 12px">Je ne trouve pas le Compagnon ici.
           Il est bien installé et ouvert sur <b>cet</b> ordinateur ?</p>`;
      sh.setFoot([btn('Réessayer', 'btn-primary', stepProbe)]);
      return;
    }
    if (!found.info.appairage){
      sh.body.innerHTML =
        `<p class="hint" style="margin:0 0 12px"><b>${esc(found.info.nom || 'Compagnon')}</b> est là ✓ —
           dans sa fenêtre, clique « Afficher le code », puis reviens.</p>`;
      sh.setFoot([btn('J’ai le code', 'btn-primary', stepProbe)]);
      return;
    }
    stepCode(found);
  };

  const stepCode = found => {
    sh.setTitle('Le code du Compagnon');
    sh.body.innerHTML =
      `<p class="hint" style="margin:0 0 10px">Le code affiché par <b>${esc(found.info.nom || 'ton ordinateur')}</b> :</p>
       <div class="field"><input id="cgCode" autocomplete="off" autocapitalize="characters"
         spellcheck="false" placeholder="XXXX-XXXX" style="text-align:center;font-family:var(--font-mono, monospace);font-size:20px;letter-spacing:2px"></div>
       <p class="hint" id="cgErr"></p>`;
    const go = async () => {
      const code = normCode(q('#cgCode').value);
      if (code.length !== 9){ q('#cgErr').textContent = 'Huit caractères — comme affiché.'; return; }
      if (!await requireCode('Ton code OpenContact, pour confirmer')) return;
      sh.setFoot(null);
      q('#cgErr').textContent = 'Association…';
      try {
        const self = await deviceSelf();
        const keys = await ensureKeys();
        const rep = await pairCompanion(found.base, code, found.info.appairage.s,
          { id: self.id, name: self.name, pub: keys ? keys.pub : '' }, getRing());
        await kvSet(COMPANION_KEY, JSON.stringify({
          k: rep.k, id: rep.compagnon.id, nom: rep.compagnon.name || 'Compagnon',
          pub: rep.compagnon.pub, at: Date.now()
        }));
        await ringAddCompanion({ id: rep.compagnon.id, name: rep.compagnon.name || 'Compagnon', pub: rep.compagnon.pub });
        logJ('Compagnon associé : ' + (rep.compagnon.name || ''));
        sh.close(null, true);
        toast('Associé à « ' + (rep.compagnon.name || 'ton ordinateur') + ' » ✓');
        bus.refresh();
        if (onDone) onDone();
      } catch (e) {
        q('#cgErr').textContent = e.message === 'code'
          ? 'Ce n’est pas ce code-là. Regarde la fenêtre du Compagnon.'
          : (e.message === 'ferme'
            ? 'Le code a expiré — refais « Afficher le code » dans le Compagnon.'
            : 'Pas de réponse — le Compagnon est toujours ouvert ?');
        sh.setFoot([btn('Associer', 'btn-primary', go)]);
      }
    };
    q('#cgCode').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    sh.setFoot([btn('Associer', 'btn-primary', go)]);
    q('#cgCode').focus();
  };

  stepIntro();
}

/* ---------- la feuille de gestion (depuis Mes appareils) ---------- */
export function openCompanionSheet(assoc, onDone){
  const sh = openSheet({ title: assoc.nom || 'Compagnon', icon: 'switch' });
  sh.body.innerHTML =
    `<p class="hint" id="cgLive" style="margin:0 0 10px">${ic('clock', 'ic-14')} État…</p>
     <div class="pick-list">
       <button class="pick pick-danger" id="cgBreak"><b>Rompre l’association</b><span>il ne recevra plus de missions</span></button>
     </div>`;
  const q = s => sh.body.querySelector(s);
  companionPresence().then(p => {
    const el = q('#cgLive');
    if (!el) return;
    el.innerHTML = p && p.state === 'on'
      ? `${ic('radio', 'ic-14')} Prêt — il répond sur cet ordinateur.`
      : `${ic('clock', 'ic-14')} Éteint ou pas sur cet ordinateur. Il reprendra à son réveil.`;
  });
  q('#cgBreak').addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: 'Rompre l’association ?', danger: true, okLabel: 'Rompre', icon: 'switch',
      msg: `<b>${esc(assoc.nom || 'Le Compagnon')}</b> ne recevra plus de missions et oublie vos clés communes. Rien d’autre n’est effacé.`
    });
    if (!ok) return;
    if (!await requireCode('Ton code, pour rompre')) return;
    /* de bonne foi : prévenir le Compagnon s'il répond, puis oublier */
    try {
      const found = await probeCompanion();
      if (found) await companionCall(found.base, assoc.k, { t: 'dissocier' });
    } catch (e) {}
    await kvDel(COMPANION_KEY);
    await ringDo('remove', assoc.id).catch(() => {});
    logJ('Compagnon dissocié');
    sh.close(null, true);
    toast('Association rompue.');
    bus.refresh();
    if (onDone) onDone();
  });
}
