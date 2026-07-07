import React from 'react';
import { ensureStyle } from '../_style.js';

const CSS = `
.oc-btn{
  appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;
  font-family:var(--font-ui);font-weight:var(--weight-semibold);font-size:var(--text-13);
  height:var(--control-h);padding:0 14px;border-radius:var(--radius-1);
  background:var(--surface-chrome);color:var(--text-body);
  border:1px solid var(--border-strong);
  box-shadow:var(--bevel-up), var(--shadow-raised);
  cursor:pointer;user-select:none;white-space:nowrap;
}
.oc-btn:hover{background:var(--surface-window)}
.oc-btn:active{
  box-shadow:var(--bevel-down);
  transform:translate(2px,2px);
  background:var(--surface-chrome);
}
.oc-btn--primary{background:var(--accent);border-color:var(--border-strong);color:var(--on-accent)}
.oc-btn--primary:hover{background:var(--accent-hover)}
.oc-btn--primary:active{background:var(--accent-hover)}
.oc-btn--danger{color:var(--red)}
.oc-btn--danger:hover{background:var(--red-wash)}
.oc-btn--ghost{background:transparent;border-color:transparent;box-shadow:none;color:var(--text-muted)}
.oc-btn--ghost:hover{background:var(--surface-chrome);color:var(--text-body)}
.oc-btn--ghost:active{transform:none;box-shadow:var(--bevel-down)}
.oc-btn--sm{height:24px;padding:0 9px;font-size:var(--text-12)}
.oc-btn--lg{height:var(--control-h-lg);padding:0 18px;font-size:var(--text-14)}
.oc-btn:disabled{
  pointer-events:none;color:var(--text-disabled);
  text-shadow:1px 1px 0 rgba(255,255,255,.7);
  box-shadow:var(--bevel-up);
}
html[data-theme="dark"] .oc-btn:disabled{text-shadow:none;opacity:.5}
`;

/**
 * Bouton système : relief biseauté, presse physique (l'ombre disparaît,
 * le bouton s'enfonce de 2px). variant: default | primary | danger | ghost.
 */
export function Button({ variant = 'default', size = 'md', disabled, children, style, ...rest }) {
  ensureStyle('oc-style-button', CSS);
  const cls = ['oc-btn'];
  if (variant !== 'default') cls.push('oc-btn--' + variant);
  if (size !== 'md') cls.push('oc-btn--' + size);
  return (
    <button className={cls.join(' ')} disabled={disabled} style={style} {...rest}>
      {children}
    </button>
  );
}
