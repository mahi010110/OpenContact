import React from 'react';
import { ensureStyle } from '../_style.js';

const CSS = `
.oc-radio{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--text-13);color:var(--text-body);user-select:none}
.oc-radio input{
  appearance:none;margin:0;flex:none;width:16px;height:16px;border-radius:50%;
  background:var(--surface-field);border:1px solid var(--border-field);
  box-shadow:var(--bevel-field);cursor:pointer;position:relative;
}
.oc-radio input:checked::after{
  content:'';position:absolute;inset:4px;background:var(--accent);
  /* pastille carrée dans un cercle : le détail pixel */
  border-radius:1px;
}
.oc-radio input:disabled{background:var(--surface-chrome);cursor:default}
.oc-radio--disabled{color:var(--text-disabled);cursor:default}
`;

/**
 * Bouton radio rond (héritage 98) à pastille carrée (détail pixel).
 */
export function Radio({ label, checked, onChange, disabled, name, value, style, ...rest }) {
  ensureStyle('oc-style-radio', CSS);
  return (
    <label className={'oc-radio' + (disabled ? ' oc-radio--disabled' : '')} style={style}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} {...rest} />
      {label && <span>{label}</span>}
    </label>
  );
}
