/* ============================================================
   OpenContact — interface · « Échanger » (à venir : étape 3)
   Les deux gestes — donner à la promo (jamais le privé) et
   recevoir (QR, fichier, texte) — arrivent à l'étape 3 de la
   refonte. En attendant, l'écran dit où en est chaque chose.
   ============================================================ */
import { $, ic } from './dom.js';

export function renderEchanger(){
  const root = $('#view-echanger');
  root.innerHTML =
    `<div class="page-inner">
       <div class="td-head"><h2>Échanger</h2><div class="td-date">de la main à la main, sans serveur</div></div>
       <div class="pcard pcard-soon">
         <h3>${ic('share', 'ic-14')} Donner &amp; recevoir</h3>
         <p class="pd">Partage tes pistes avec ta promo par <b>QR</b> ou par <b>fichier .oc</b>, reçois les leurs
            avec aperçu avant fusion — sans jamais rien écraser, et sans jamais inclure ton suivi privé.</p>
         <p class="pd">Cette page arrive dans la prochaine étape de la refonte.
            En attendant, ta <b>sauvegarde personnelle</b> (complète, elle) est déjà disponible dans « Moi ».</p>
       </div>
     </div>`;
}
