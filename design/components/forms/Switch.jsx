import React from 'react';
import { ensureStyle } from '../_style.js';

const CSS = `
.oc-switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--text-13);color:var(--text-body);user-select:none}
.oc-switch input{
  appearance:none;margin:0;flex:none;width:36px;height:18px;border-radius:var(--radius-1);
  background:var(--surface-chrome);border:1px solid var(--border-strong);
  box-shadow:var(--bevel-field);cursor:pointer;position:relative;
  transition:background var(--dur-1);
}
.oc-switch input::after{
  content:'';position:absolute;top:1px;left:1px;width:14px;height:14px;
  background:var(--surface-window);border:1px solid var(--border-strong);
  border-radius:var(--radius-1);box-shadow:var(--bevel-up);
  transition:left var(--dur-2) var(--ease-steps);
}
.oc-switch input:checked{background:var(--accent)}
.oc-switch input:checked::after{left:19px}
.oc-switch input:disabled{opacity:.5;cursor:default}
`;

/**
 * Interrupteur rectangulaire : curseur carré biseauté qui saute
 * d'un bord à l'autre en 2 pas (steps) — pas de glissement fluide.
 */
export function Switch({ label, checked, onChange, disabled, style, ...rest }) {
  ensureStyle('oc-style-switch', CSS);
  return (
    <label className="oc-switch" style={style}>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} disabled={disabled} {...rest} />
      {label && <span>{label}</span>}
    </label>
  );
}
