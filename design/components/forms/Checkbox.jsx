import React from 'react';
import { ensureStyle } from '../_style.js';

/* Coche pixel (pixelarticons check) inlinée. */
const CHECK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='white' d='M18 6h2v2h-2V6Zm-2 4V8h2v2h-2Zm-2 2v-2h2v2h-2Zm-2 2h2v-2h-2v2Zm-2 2h2v-2h-2v2Zm-2 0v2h2v-2H8Zm-2-2h2v2H6v-2Zm0 0H4v-2h2v2Z'/%3E%3C/svg%3E")`;

const CSS = `
.oc-check{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--text-13);color:var(--text-body);user-select:none}
.oc-check input{
  appearance:none;margin:0;flex:none;width:16px;height:16px;border-radius:var(--radius-1);
  background:var(--surface-field);border:1px solid var(--border-field);
  box-shadow:var(--bevel-field);cursor:pointer;
}
.oc-check input:checked{
  background:var(--accent) ${CHECK} no-repeat center / 12px 12px;
  border-color:var(--border-strong);
}
.oc-check input:disabled{background:var(--surface-chrome);cursor:default}
.oc-check--disabled{color:var(--text-disabled);cursor:default}
`;

/**
 * Case à cocher carrée, coche pixel blanche sur teal.
 */
export function Checkbox({ label, checked, onChange, disabled, style, ...rest }) {
  ensureStyle('oc-style-checkbox', CSS);
  return (
    <label className={'oc-check' + (disabled ? ' oc-check--disabled' : '')} style={style}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} {...rest} />
      {label && <span>{label}</span>}
    </label>
  );
}
