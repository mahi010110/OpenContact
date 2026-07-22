/* ============================================================
   OpenContact — interface · utilitaires d'écran
   Sélecteurs, icônes pixel, toast, feuilles (bottom sheet mobile /
   fenêtre centrée desktop) avec pile, piège de focus et Échap.
   ============================================================ */
import { esc } from '../engine/utils.js';

export const $ = s => document.querySelector(s);
export const $$ = s => Array.from(document.querySelectorAll(s));

/* icône pixel (assets/icons/) teintée par currentColor — masque CSS .ic.
   mask-image en style direct : une url() relative dans une variable CSS
   ne se résout pas pareil selon les navigateurs. */
export function ic(name, cls){
  const u = `url(assets/icons/${name}.svg)`;
  return `<span class="ic${cls ? ' ' + cls : ''}" style="-webkit-mask-image:${u};mask-image:${u}" aria-hidden="true"></span>`;
}

export function el(html){
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export function btn(label, cls, fn, icon){
  const b = el(`<button class="btn ${cls || ''}">${icon ? ic(icon, 'ic-14') + ' ' : ''}${esc(label)}</button>`);
  if (fn) b.addEventListener('click', fn);
  return b;
}

/* ---------- barres transitoires : balayer (tactile) / ✕ (desktop) ---------- */
function barX(onClose){
  const b = el('<button class="bar-x" aria-label="Fermer">✕</button>');
  b.addEventListener('click', onClose);
  return b;
}
/* glisser horizontalement une barre centrée (transform -50%) la ferme ;
   sous le seuil, elle revient — les minuteurs restent le secours */
function bindBarSwipe(bar, dismiss){
  if (!matchMedia('(pointer:coarse)').matches) return;
  let x0 = null, y0 = null, dx = 0, active = false;
  bar.addEventListener('touchstart', e => {
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; active = false;
  }, { passive: true });
  bar.addEventListener('touchmove', e => {
    if (x0 == null) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (!active){
      if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my) * 1.4) return;
      active = true;
    }
    dx = mx;
    bar.style.transition = 'none';
    bar.style.transform = `translateX(calc(-50% + ${dx}px))`;
    bar.style.opacity = String(Math.max(.25, 1 - Math.abs(dx) / 260));
  }, { passive: true });
  bar.addEventListener('touchend', () => {
    if (x0 == null) return;
    x0 = null;
    bar.style.transition = '';
    if (active && Math.abs(dx) > 64){ dismiss(); return; }
    bar.style.transform = '';
    bar.style.opacity = '';
  });
}

let toastTimer = null;
function hideToast(){
  const t = $('#toast');
  t.classList.remove('on');
  t.style.transform = '';
  t.style.opacity = '';
}
export function toast(msg){
  const t = $('#toast');
  t.innerHTML = '';
  t.append(document.createTextNode(msg), barX(hideToast));
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 3400);
}
bindBarSwipe(document.getElementById('toast'), hideToast);

/* ---------- feuilles empilables ---------- */
const stack = [];
function focusables(root){
  return Array.from(root.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(x => x.offsetParent !== null);
}
export function openSheet(o){
  o = o || {};
  /* Les feuilles qui succèdent directement à une action transitoire peuvent
     écarter son ancien toast. Ce choix reste explicite : une confirmation
     importante (biométrie après protection, par exemple) conserve le retour. */
  if (o.clearToast) hideToast();
  const ov = el(
    `<div class="overlay open">
      <div class="modal ${o.className || ''}" role="dialog" aria-modal="true" aria-label="${esc(o.title || '')}">
        <div class="modal-h"><h2>${o.icon ? ic(o.icon, 'ic-14') : ''}<span>${esc(o.title || '')}</span></h2>
          <button class="x" aria-label="Fermer">✕</button></div>
        <div class="modal-b"></div>
        <div class="modal-f" hidden></div>
      </div>
    </div>`);
  const body = ov.querySelector('.modal-b');
  const foot = ov.querySelector('.modal-f');
  if (typeof o.body === 'string') body.innerHTML = o.body;
  else if (o.body) body.append(o.body);

  let closed = false;
  const prevFocus = document.activeElement;
  /* o.guard : consulté avant de fermer (léger garde-fou « quitter sans
     enregistrer ? ») — false ou promesse fausse = on reste */
  function close(result, force){
    if (closed) return;
    if (!force && o.guard){
      const g = o.guard();
      if (g === false || (g && typeof g.then === 'function')){
        /* on reste : la feuille reprend sa place (glisser interrompu) */
        const m = ov.querySelector('.modal');
        if (m) m.style.transform = '';
        if (g !== false) g.then(okv => { if (okv) close(result, true); });
        return;
      }
    }
    closed = true;
    const i = stack.indexOf(rec);
    if (i >= 0) stack.splice(i, 1);
    ov.remove();
    if (o.onClose) o.onClose(result);
    if (prevFocus && prevFocus.focus){ try { prevFocus.focus(); } catch (e) {} }
  }
  const rec = { ov, close, dismissible: o.dismissible !== false };
  stack.push(rec);
  ov.addEventListener('click', e => { if (e.target === ov && o.dismissible !== false) close(); });
  ov.querySelector('.x').addEventListener('click', () => close());
  /* tactile : glisser vers le bas referme — depuis la barre de titre
     toujours, et depuis le corps entier quand la feuille est petite
     (rien à faire défiler) : les confirmations se balaient d'un pouce */
  if (matchMedia('(pointer:coarse)').matches && o.dismissible !== false){
    const modal = ov.querySelector('.modal');
    const bindDrag = (zone, guard) => {
      let y0 = null, dy = 0;
      zone.addEventListener('touchstart', e => {
        if (guard && !guard(e)) return;
        y0 = e.touches[0].clientY; dy = 0;
        modal.style.transition = 'none';
      }, { passive: true });
      zone.addEventListener('touchmove', e => {
        if (y0 == null) return;
        dy = Math.max(0, e.touches[0].clientY - y0);
        modal.style.transform = dy ? `translateY(${dy}px)` : '';
      }, { passive: true });
      zone.addEventListener('touchend', () => {
        if (y0 == null) return;
        modal.style.transition = '';
        if (dy > 90) close();
        else modal.style.transform = '';
        y0 = null;
      });
    };
    bindDrag(ov.querySelector('.modal-h'));
    bindDrag(body, e =>
      body.scrollHeight - body.clientHeight <= 4 &&
      !e.target.closest('button, a, input, textarea, select, [role="button"], .datechips'));
  }
  document.body.append(ov);
  requestAnimationFrame(() => {
    const f = (o.focus && ov.querySelector(o.focus)) || ov.querySelector('.x');
    try { f.focus({ preventScroll: true }); } catch (e) {}
  });
  const api = {
    ov, body, close,
    setTitle(t){ ov.querySelector('.modal-h h2 span').textContent = t; },
    setFoot(content){
      /* remplace — les feuilles à étapes rappellent setFoot à chaque
         écran ; null = pas de pied (fermer = la croix ou le glisser) */
      foot.innerHTML = '';
      foot.hidden = content == null;
      if (content == null) return;
      if (typeof content === 'string') foot.innerHTML = content;
      else foot.append(...[].concat(content));
    }
  };
  return api;
}
export function topSheet(){ return stack[stack.length - 1] || null; }

/* ---------- panneau latéral (desktop) ----------
   « on ouvre une piste à droite, la liste reste » (#10). Même structure
   interne qu'une feuille (modal-h/b/f) : un écran s'y rend tel quel.
   Un seul panneau à la fois — en ouvrir un autre remplace le premier,
   après son garde-fou (null rendu tant qu'il retient). Non modal :
   Échap le ferme quand aucune feuille n'est ouverte. */
let panelRec = null;
export function openPanel(o){
  o = o || {};
  if (panelRec && !panelRec.tryClose()) return null;
  const aside = el(
    `<aside class="spanel" role="complementary" aria-label="${esc(o.title || '')}">
       <div class="modal ${o.className || ''}">
         <div class="modal-h"><h2>${o.icon ? ic(o.icon, 'ic-14') : ''}<span>${esc(o.title || '')}</span></h2>
           <button class="x" aria-label="Fermer">✕</button></div>
         <div class="modal-b"></div>
         <div class="modal-f" hidden></div>
       </div>
     </aside>`);
  const body = aside.querySelector('.modal-b');
  const foot = aside.querySelector('.modal-f');
  if (typeof o.body === 'string') body.innerHTML = o.body;
  else if (o.body) body.append(o.body);
  let closed = false;
  function close(result, force){
    if (closed) return;
    if (!force && o.guard){
      const g = o.guard();
      if (g === false) return;
      if (g && typeof g.then === 'function'){ g.then(ok => { if (ok) close(result, true); }); return; }
    }
    closed = true;
    if (panelRec === rec) panelRec = null;
    aside.remove();
    if (o.onClose) o.onClose(result);
  }
  const rec = {
    close,
    /* vrai = la place est libre ; faux = garde-fou en cours (asynchrone) */
    tryClose(){
      if (closed) return true;
      if (o.guard){
        const g = o.guard();
        if (g === false) return false;
        if (g && typeof g.then === 'function'){ g.then(ok => { if (ok) close(undefined, true); }); return false; }
      }
      close(undefined, true);
      return true;
    }
  };
  panelRec = rec;
  aside.querySelector('.x').addEventListener('click', () => close());
  (document.querySelector('.main') || document.body).append(aside);
  return {
    ov: aside, body, close,
    setTitle(t){ aside.querySelector('.modal-h h2 span').textContent = t; },
    setFoot(content){
      foot.innerHTML = '';
      foot.hidden = content == null;
      if (content == null) return;
      if (typeof content === 'string') foot.innerHTML = content;
      else foot.append(...[].concat(content));
    }
  };
}
export function closePanel(){ if (panelRec) panelRec.close(); }

document.addEventListener('keydown', e => {
  if (!stack.length){
    if (e.key === 'Escape' && panelRec){ e.preventDefault(); panelRec.close(); }
    return;
  }
  const top = stack[stack.length - 1];
  if (e.key === 'Escape'){ e.preventDefault(); if (top.dismissible) top.close(); return; }
  if (e.key !== 'Tab') return;
  const f = focusables(top.ov);
  if (!f.length){ e.preventDefault(); return; }
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
});

/* barre « Annuler » ~30 s — pour les gestes lourds mais réversibles
   (fusion, suppression, restauration) : le clic rejoue l'instantané
   fourni. Se ferme d'un balayage (tactile) ou du ✕ (desktop). */
let undoTimer = null;
export function showUndo(msgHTML, onUndo){
  document.querySelector('.undo-bar')?.remove();
  clearTimeout(undoTimer);
  const bar = el(`<div class="undo-bar"><span>${msgHTML}</span></div>`);
  bar.append(btn('Annuler', 'btn-sm', () => { bar.remove(); onUndo(); }, 'undo'), barX(() => bar.remove()));
  bindBarSwipe(bar, () => bar.remove());
  document.body.append(bar);
  undoTimer = setTimeout(() => bar.remove(), 30000);
}

/* ---------- suppression au geste — le motif unique ----------
   Le nœud fournit un enfant .sw-in (le contenu visible) ; ici :
   · tactile — glisser vers la gauche révèle « Supprimer », relâché
     au-delà du seuil la ligne part (seuil calé pour ignorer le
     défilement vertical) ;
   · desktop — poubelle au survol / au focus (accessible clavier).
   L'appelant double toujours onDelete d'un showUndo — jamais de
   confirmation. */
export function bindDeleteGesture(node, onDelete){
  const inner = node.querySelector('.sw-in');
  if (!inner || node.__swDel) return;
  node.__swDel = true;
  node.classList.add('sw');
  let gone = false;
  const vanish = () => {
    if (gone) return;
    gone = true;
    node.classList.add('sw-gone');
    setTimeout(onDelete, 150);
  };
  const del = el(`<button class="hov-del" aria-label="Supprimer" title="Supprimer">${ic('trash', 'ic-14')}</button>`);
  del.addEventListener('click', e => { e.stopPropagation(); vanish(); });
  inner.append(del);
  if (!matchMedia('(pointer:coarse)').matches) return;
  node.prepend(el(`<div class="sw-under" aria-hidden="true">${ic('trash', 'ic-14')} Supprimer</div>`));
  let x0 = null, y0 = null, dx = 0, active = false, endedAt = 0;
  node.addEventListener('touchstart', e => {
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; active = false;
  }, { passive: true });
  node.addEventListener('touchmove', e => {
    if (x0 == null) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (!active){
      if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my) * 1.4) return;
      active = true;
    }
    dx = Math.max(-96, Math.min(0, mx));
    inner.style.transform = dx ? `translateX(${dx}px)` : '';
    node.classList.toggle('swipe-del', dx < -24);
  }, { passive: true });
  node.addEventListener('touchend', () => {
    if (x0 == null) return;
    x0 = null;
    if (active){
      endedAt = Date.now();
      if (dx < -72){ inner.style.transform = ''; node.classList.remove('swipe-del'); vanish(); return; }
    }
    inner.style.transform = '';
    node.classList.remove('swipe-del');
  });
  /* le clic fantôme qui suit un glissement n'ouvre rien */
  node.addEventListener('click', e => {
    if (Date.now() - endedAt < 400){ e.stopPropagation(); e.preventDefault(); }
  }, true);
}

/* confirmation simple — remplace confirm() natif */
export function confirmSheet(o){
  return new Promise(resolve => {
    const s = openSheet({
      title: o.title || 'Confirmer ?',
      icon: o.icon || 'square-alert',
      className: 'modal-confirm',
      body: `<p class="cf-msg">${o.msg || ''}</p>`,
      onClose: v => resolve(!!v)
    });
    s.setFoot([
      btn(o.cancelLabel || 'Annuler', 'btn-ghost', () => s.close(false)),
      btn(o.okLabel || 'Confirmer', o.danger ? 'btn-danger' : 'btn-primary', () => s.close(true))
    ]);
  });
}
