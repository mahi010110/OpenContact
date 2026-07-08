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

let toastTimer = null;
export function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 3400);
}

/* ---------- feuilles empilables ---------- */
const stack = [];
function focusables(root){
  return Array.from(root.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(x => x.offsetParent !== null);
}
export function openSheet(o){
  o = o || {};
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
  function close(result){
    if (closed) return;
    closed = true;
    const i = stack.indexOf(rec);
    if (i >= 0) stack.splice(i, 1);
    ov.remove();
    if (o.onClose) o.onClose(result);
    if (prevFocus && prevFocus.focus){ try { prevFocus.focus(); } catch (e) {} }
  }
  const rec = { ov, close };
  stack.push(rec);
  ov.addEventListener('click', e => { if (e.target === ov && o.dismissible !== false) close(); });
  ov.querySelector('.x').addEventListener('click', () => close());
  document.body.append(ov);
  requestAnimationFrame(() => {
    const f = (o.focus && ov.querySelector(o.focus)) || ov.querySelector('.x');
    try { f.focus({ preventScroll: true }); } catch (e) {}
  });
  const api = {
    ov, body, close,
    setTitle(t){ ov.querySelector('.modal-h h2 span').textContent = t; },
    setFoot(content){
      foot.hidden = false;
      if (typeof content === 'string') foot.innerHTML = content;
      else foot.append(...[].concat(content));
    }
  };
  return api;
}
export function topSheet(){ return stack[stack.length - 1] || null; }

document.addEventListener('keydown', e => {
  if (!stack.length) return;
  const top = stack[stack.length - 1];
  if (e.key === 'Escape'){ e.preventDefault(); top.close(); return; }
  if (e.key !== 'Tab') return;
  const f = focusables(top.ov);
  if (!f.length){ e.preventDefault(); return; }
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
});

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
