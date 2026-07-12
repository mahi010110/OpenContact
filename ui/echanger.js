/* ============================================================
   OpenContact — interface · « Échanger »
   Deux verbes : Donner · Recevoir. En dessous, la Salle de groupe
   (un lieu vivant — la promo en direct, bêta discrète). Tout en
   bas, le rappel qui compte : jamais le privé. La sync de MES
   appareils vit dans « Moi ».
   ============================================================ */
import { $, ic } from './dom.js';
import { openDonner } from './donner.js';
import { openRecevoir } from './recevoir.js';
import { openPromo } from './direct.js';

export function renderEchanger(){
  const root = $('#view-echanger');
  root.innerHTML =
    `<div class="page-inner">
       <div class="td-head"><h2>Échanger</h2></div>

       <div class="hero2">
         <button class="btn btn-primary hero" id="ecGive">${ic('share', 'ic-20')}<span>Donner</span></button>
         <button class="btn hero" id="ecRecv">${ic('inbox', 'ic-20')}<span>Recevoir</span></button>
       </div>

       <div class="pcard">
         <div class="ec-row" style="border:0;padding:2px 0">
           <div class="ec-row-m"><b>${ic('radio', 'ic-14')} Salle de groupe <span class="tag-beta">bêta</span></b>
             <span class="ec-sub">la promo en direct</span></div>
           <button class="btn" id="ecPromo">Entrer</button>
         </div>
       </div>

       <p class="hint ec-foot">${ic('lock', 'ic-14')} Données locales — jamais le privé.</p>
     </div>`;
  root.querySelector('#ecGive').addEventListener('click', openDonner);
  root.querySelector('#ecRecv').addEventListener('click', openRecevoir);
  root.querySelector('#ecPromo').addEventListener('click', openPromo);
}
