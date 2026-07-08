/* ============================================================
   OpenContact — interface · « Moi »
   Ce qui n'appartient qu'à l'utilisateur. À cette étape : la
   sauvegarde complète (données en sécurité pendant la refonte)
   et la version. Profil, CV, modèles, aide arrivent à l'étape 4.
   ============================================================ */
import { APP_VERSION } from '../engine/model.js';
import { fullPayload } from '../engine/exchange.js';
import { fmtSize } from '../engine/utils.js';
import { S } from './state.js';
import { $, ic, toast } from './dom.js';

export function downloadBackup(){
  const txt = JSON.stringify(fullPayload(S.companies, S.profile, S.orphans));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'application/octet-stream' }));
  a.download = 'opencontact-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.oc';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Sauvegarde téléchargée — garde-la précieusement.');
}

export function renderMoi(){
  const root = $('#view-moi');
  root.innerHTML =
    `<div class="page-inner">
       <div class="td-head"><h2>Moi</h2><div class="td-date">privé — jamais partagé</div></div>
       <div class="pcard">
         <h3>${ic('save', 'ic-14')} Ma sauvegarde <span class="tag-priv">privé inclus</span></h3>
         <p class="pd">Tout — pistes, suivi privé, profil, contacts à rattacher — dans un fichier <b>.oc</b>.
            Pour changer d’appareil, ou dormir tranquille. À refaire régulièrement.</p>
         <button class="btn btn-primary" id="moiBackup">${ic('download', 'ic-14')} Télécharger ma sauvegarde</button>
         <div class="stor-line" id="moiStor"></div>
       </div>
       <div class="pcard pcard-soon">
         <h3>${ic('user', 'ic-14')} Profil, CV &amp; modèles d’emails</h3>
         <p class="pd">Ton nom, ta formation, ton CV et tes modèles remplissent les emails en un tap.
            Cette section arrive dans la prochaine étape de la refonte — tes données existantes sont conservées.</p>
       </div>
       <div class="moi-ver">OpenContact ${APP_VERSION} · local-first, sans compte · fichier .oc</div>
     </div>`;
  root.querySelector('#moiBackup').addEventListener('click', downloadBackup);
  if (navigator.storage && navigator.storage.estimate){
    navigator.storage.estimate().then(({ usage, quota }) => {
      if (usage != null && quota){
        $('#moiStor').textContent = 'Espace local utilisé : ' + fmtSize(usage) + ' sur ' + fmtSize(quota) + '.';
      }
    }).catch(() => {});
  }
}
