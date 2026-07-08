/* ============================================================
   OpenContact — interface · « Échanger »
   Deux gestes, nettement séparés : DONNER à la promo (jamais le
   privé) et RECEVOIR (QR, fichier, texte — aperçu avant fusion).
   La sauvegarde personnelle complète, elle, vit dans « Moi ».
   ============================================================ */
import { $, ic } from './dom.js';
import { openDonner } from './donner.js';
import { openRecevoir } from './recevoir.js';

export function renderEchanger(){
  const root = $('#view-echanger');
  root.innerHTML =
    `<div class="page-inner">
       <div class="td-head"><h2>Échanger</h2><div class="td-date">de la main à la main, sans serveur</div></div>
       <div class="pcard">
         <h3>${ic('share', 'ic-14')} Donner à la promo <span class="tag-share">jamais le privé</span></h3>
         <p class="pd">Une bonne piste rendue circule : QR en personne, ou fichier <b>.oc</b> (partage,
            téléchargement, copie — mot de passe possible). Tes statuts, notes et actions restent chez toi.</p>
         <button class="btn btn-primary" id="ecGive">${ic('share', 'ic-14')} Donner des pistes</button>
       </div>
       <div class="pcard">
         <h3>${ic('inbox', 'ic-14')} Recevoir</h3>
         <p class="pd">Scanne un QR, ouvre un fichier ou colle un texte. Tu vois <b>l’aperçu avant</b>
            (« 12 reçues, dont 4 nouvelles »), rien n’est écrasé, et tu peux annuler juste après.</p>
         <button class="btn" id="ecRecv">${ic('inbox', 'ic-14')} Recevoir des pistes</button>
       </div>
       <p class="hint" style="margin-top:2px">${ic('save', 'ic-14')} Ta <b>sauvegarde complète</b> (privé inclus, pour toi seul) est dans
          <a href="#/moi">« Moi »</a>. Le QR sert aussi de pont ordinateur → téléphone.</p>
     </div>`;
  root.querySelector('#ecGive').addEventListener('click', openDonner);
  root.querySelector('#ecRecv').addEventListener('click', openRecevoir);
}
