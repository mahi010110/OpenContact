import React from 'react';
import { ensureStyle } from '../_style.js';

const CSS = `
.oc-input{
  appearance:none;display:block;width:100%;
  font-family:var(--font-ui);font-size:var(--text-14);color:var(--text-body);
  height:var(--control-h);padding:0 10px;border-radius:var(--radius-1);
  background:var(--surface-field);
  border:1px solid var(--border-field);
  box-shadow:var(--bevel-field);
}
.oc-input::placeholder{color:var(--text-muted)}
.oc-input--mono{font-family:var(--font-mono);font-size:var(--text-13)}
.oc-input:disabled{background:var(--surface-chrome);color:var(--text-disabled)}
textarea.oc-input{height:auto;min-height:68px;padding:8px 10px;resize:vertical;line-height:var(--leading-body)}
`;

/**
 * Champ de saisie « en creux » : fond blanc, bordure encre, biseau inversé.
 * multiline=true rend un textarea.
 */
export function Input({ multiline, mono, style, ...rest }) {
  ensureStyle('oc-style-input', CSS);
  const cls = 'oc-input' + (mono ? ' oc-input--mono' : '');
  if (multiline) return <textarea className={cls} style={style} {...rest} />;
  return <input className={cls} style={style} {...rest} />;
}
