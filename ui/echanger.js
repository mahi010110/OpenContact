/* ============================================================
   OpenContact — interface · « Échanger »
   Donner et Recevoir d'abord : les gestes du quotidien (QR en
   personne, fichier .oc, coller — jamais le privé). En dessous,
   replié : la synchronisation de MES appareils (lien persistant,
   statut vivant) et le Partage en groupe (bêta) — le pli s'ouvre
   tout seul quand un lien est actif.
   ============================================================ */
import { $, ic } from './dom.js';
import { openDonner } from './donner.js';
import { openRecevoir } from './recevoir.js';
import { openAppareils, openPromo } from './direct.js';
import { getSync } from './synclive.js';

export function renderEchanger(){
  const root = $('#view-echanger');
  const sy = getSync();
  root.innerHTML =
    `<div class="page-inner">
       <div class="td-head"><h2>Échanger</h2><div class="td-date">de pair à pair, sans serveur</div></div>

       <div class="pcard">
         <h3>${ic('share', 'ic-14')} Avec la promo <span class="tag-share">jamais le privé</span></h3>
         <p class="pd">QR en personne, fichier .oc, copier-coller — aperçu avant chaque fusion.</p>
         <div class="pc-actions">
           <button class="btn btn-primary" id="ecGive">${ic('share', 'ic-14')} Donner</button>
           <button class="btn" id="ecRecv">${ic('inbox', 'ic-14')} Recevoir</button>
         </div>
       </div>

       <details class="pcard pcard-details"${sy.phrase ? ' open' : ''}>
         <summary><h3>${ic('switch', 'ic-14')} En continu — appareils &amp; groupe</h3></summary>
         <div class="ec-row">
           <div class="ec-row-m"><b>Mes appareils</b>
             <span class="ec-sub" id="ecSyncSt">${syncLabel()}</span></div>
           <button class="btn" id="ecSync">${sy.phrase ? 'Gérer' : 'Relier'}</button>
         </div>
         <div class="ec-row">
           <div class="ec-row-m"><b>Partage en groupe</b> <span class="tag-beta">bêta</span>
             <span class="ec-sub">les fiches circulent en direct dans le groupe</span></div>
           <button class="btn" id="ecPromo">Entrer</button>
         </div>
       </details>

       <p class="hint" style="margin-top:2px">${ic('save', 'ic-14')} Ta <a href="#/moi">sauvegarde complète</a> reste dans « Moi ».</p>
     </div>`;
  root.querySelector('#ecGive').addEventListener('click', openDonner);
  root.querySelector('#ecRecv').addEventListener('click', openRecevoir);
  root.querySelector('#ecSync').addEventListener('click', openAppareils);
  root.querySelector('#ecPromo').addEventListener('click', openPromo);
  /* le statut suit l'état vivant ; si le lien apparaît ou disparaît
     (démarrage différé, rompre), la structure se re-rend */
  const wasLinked = !!sy.phrase;
  if (root.__onSync) document.removeEventListener('oc:sync', root.__onSync);
  root.__onSync = () => {
    if (root.hidden){ document.removeEventListener('oc:sync', root.__onSync); root.__onSync = null; return; }
    if (!!getSync().phrase !== wasLinked){ renderEchanger(); return; }
    const el = root.querySelector('#ecSyncSt');
    if (el) el.textContent = syncLabel();
  };
  document.addEventListener('oc:sync', root.__onSync);
}

function syncLabel(){
  const sy = getSync();
  if (!sy.phrase) return 'téléphone + ordinateur, tout synchronisé en continu';
  if (sy.state === 'on') return 'relié — ' + sy.peers + ' appareil' + (sy.peers > 1 ? 's' : '') + ' en face';
  if (sy.state === 'err') return 'relié — pas de connexion pour l’instant';
  return 'relié — en attente des autres appareils';
}
