/* ============================================================
   OpenContact — interface · feuilles d'action
   Les trois micro-décisions du quotidien, une à la fois :
   « et ensuite ? » (prochaine action), « reporter à quand ? »,
   « clôturer pourquoi ? ». Chaque tap valide et referme.
   ============================================================ */
import { esc } from '../engine/utils.js';
import { CLOSE_REASONS } from '../engine/model.js';
import { bus, setNextAction, closePiste } from './state.js';
import { openSheet, toast, ic, btn } from './dom.js';
import { plusDaysISO, nextMondayISO, frDate } from './dates.js';

const DATE_CHOICES = [
  ['Demain', () => plusDaysISO(1)],
  ['+3 jours', () => plusDaysISO(3)],
  ['+7 jours', () => plusDaysISO(7)],
  ['Lundi', nextMondayISO]
];

/* champ date + bouton OK : le bouton apparaît dès qu'une date est posée */
function bindDateOk(root, inputSel, okSel, pick){
  const inp = root.querySelector(inputSel);
  const okB = root.querySelector(okSel);
  const sync = () => { okB.hidden = !inp.value; };
  inp.addEventListener('input', sync);
  inp.addEventListener('change', sync);
  okB.addEventListener('click', () => { if (inp.value) pick(inp.value); });
}

/* « Et ensuite ? » — un verbe + une date ; taper une date valide et
   referme. En modification (une date existe déjà — opts.presetDate),
   « OK » valide un changement du « Quoi ? » seul en gardant la date. */
export function askNextAction(c, opts){
  opts = opts || {};
  const sh = openSheet({
    title: opts.title || 'Prochaine action ?',
    icon: 'calendar',
    focus: '#naTxt',
    onClose: () => { if (opts.onDone) opts.onDone(); }
  });
  sh.body.innerHTML =
    `<div class="na-company">${esc(c.name)}</div>
     <div class="field"><label for="naTxt">Quoi ?</label>
       <input id="naTxt" value="${esc(opts.preset != null ? opts.preset : (c.nextActionText || ''))}"
              placeholder="Ex : Relancer le RH" autocomplete="off"></div>
     <div class="field"><label id="naWhen">Quand ? <span class="lbl-soft">— un tap suffit</span></label>
       <div class="datechips" role="group" aria-labelledby="naWhen">
         ${DATE_CHOICES.map((d, i) => `<button class="dchip" data-i="${i}">${d[0]}</button>`).join('')}
       </div>
     </div>
     <div class="field"><label for="naDate">Ou une date précise</label>
       <div class="date-row">
         <input id="naDate" type="date" min="${plusDaysISO(0)}">
         <button class="btn btn-primary" id="naOk" hidden>OK</button>
       </div></div>`;
  const pick = iso => {
    const txt = sh.body.querySelector('#naTxt').value.trim() || 'Faire le point';
    /* mode formulaire (fiche) : la valeur revient à l'appelant, qui
       n'enregistrera qu'au « Confirmer » */
    if (opts.onPick){
      opts.onPick(txt, iso);
      sh.close();
      return;
    }
    setNextAction(c, txt, iso);
    sh.close();
    toast('Noté : ' + txt + ' — ' + frDate(iso));
    bus.refresh();
  };
  sh.body.querySelectorAll('.dchip').forEach(b =>
    b.addEventListener('click', () => pick(DATE_CHOICES[+b.dataset.i][1]())));
  /* la date précise se VALIDE : sur mobile, la roue déclenche des
     `change` intermédiaires — fermer au premier aurait pris la mauvaise date */
  bindDateOk(sh.body, '#naDate', '#naOk', pick);
  /* une date existe déjà : changer seulement le « Quoi ? » se valide
     (OK ou Entrée), la date en place est gardée */
  if (opts.presetDate){
    sh.body.querySelector('#naTxt').addEventListener('keydown', e => {
      if (e.key === 'Enter') pick(opts.presetDate);
    });
    sh.setFoot([btn('OK — garder ' + frDate(opts.presetDate), 'btn-primary', () => pick(opts.presetDate))]);
  }
  return sh;
}

/* « Reporter à quand ? » — le verbe ne change pas, seulement la date */
export function reportAction(c){
  const sh = openSheet({ title: 'Reporter', icon: 'clock' });
  sh.body.innerHTML =
    `<div class="na-company">${esc(c.nextActionText || 'Faire le point')} — ${esc(c.name)}</div>
     <div class="pick-list">
       ${DATE_CHOICES.map((d, i) =>
         `<button class="pick" data-i="${i}"><b>${d[0]}</b><span>${frDate(d[1]())}</span></button>`).join('')}
     </div>
     <div class="field" style="margin-top:10px"><label for="rpDate">Ou une date précise</label>
       <div class="date-row">
         <input id="rpDate" type="date" min="${plusDaysISO(0)}">
         <button class="btn btn-primary" id="rpOk" hidden>OK</button>
       </div></div>`;
  const pick = iso => {
    setNextAction(c, c.nextActionText, iso);
    sh.close();
    toast('Reporté à ' + frDate(iso) + '.');
    bus.refresh();
  };
  sh.body.querySelectorAll('.pick').forEach(b =>
    b.addEventListener('click', () => pick(DATE_CHOICES[+b.dataset.i][1]())));
  bindDateOk(sh.body, '#rpDate', '#rpOk', pick);
}

/* « Clôturer » — une raison, un tap ; la piste reste dans « Mes pistes » */
export function askClose(c, opts){
  opts = opts || {};
  const sh = openSheet({ title: 'Clôturer la piste', icon: 'archive' });
  sh.body.innerHTML =
    `<div class="na-company">${esc(c.name)}</div>
     <div class="pick-list">
       ${Object.keys(CLOSE_REASONS).map(k =>
         `<button class="pick pick-close" data-r="${k}" style="--c:${CLOSE_REASONS[k].color}">
            <b>${CLOSE_REASONS[k].label}</b>
            <span>${k === 'won' ? 'bravo !' : k === 'rejected' ? 'la suivante sera la bonne' : 'on passe à autre chose'}</span>
          </button>`).join('')}
     </div>
     <p class="hint">${ic('archive', 'ic-14')} Elle reste dans « Mes pistes », rouvrable.</p>`;
  sh.body.querySelectorAll('.pick-close').forEach(b =>
    b.addEventListener('click', () => {
      closePiste(c, b.dataset.r);
      sh.close();
      toast(b.dataset.r === 'won'
        ? '🎉 Décroché — félicitations !'
        : 'Piste clôturée (' + CLOSE_REASONS[b.dataset.r].label + ').');
      if (opts.onDone) opts.onDone();
      bus.refresh();
    }));
}
