import React from 'react';
import { ensureStyle } from '../_style.js';

/* Chevron pixel (pixelarticons chevron-down) inliné pour rester autonome. */
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%235C6672' d='M7 8h2v2H7V8Zm4 4H9v-2h2v2Zm2 0v2h-2v-2h2Zm2-2h-2v2h2v-2Zm0 0V8h2v2h-2Z'/%3E%3C/svg%3E")`;
const CHEVRON_DARK = CHEVRON.replace('%235C6672', '%239AA4B0');

const CSS = `
.oc-select{
  appearance:none;display:block;width:100%;
  font-family:var(--font-ui);font-size:var(--text-13);font-weight:var(--weight-medium);color:var(--text-body);
  height:var(--control-h);padding:0 30px 0 10px;border-radius:var(--radius-1);
  background:var(--surface-field) ${CHEVRON} no-repeat right 7px center / 16px 16px;
  border:1px solid var(--border-field);
  box-shadow:var(--bevel-field);
  cursor:pointer;
}
html[data-theme="dark"] .oc-select{background-image:${CHEVRON_DARK}}
.oc-select:disabled{background-color:var(--surface-chrome);color:var(--text-disabled);cursor:default}
`;

/**
 * Liste déroulante système : même creux que Input, chevron pixel.
 * options: [{value, label}] ou tableau de chaînes.
 */
export function Select({ options = [], style, children, ...rest }) {
  ensureStyle('oc-style-select', CSS);
  return (
    <select className="oc-select" style={style} {...rest}>
      {children}
      {options.map((o) => {
        const v = typeof o === 'string' ? { value: o, label: o } : o;
        return <option key={v.value} value={v.value}>{v.label}</option>;
      })}
    </select>
  );
}
