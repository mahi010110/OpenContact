import React from 'react';
import { ensureStyle } from '../_style.js';

const CSS = `
.oc-fieldset{
  border:1px solid var(--border-soft);border-radius:var(--radius-0);
  padding:var(--space-4) var(--space-4) var(--space-4);margin:0;min-width:0;
}
.oc-fieldset>legend{
  font-size:var(--text-11);font-weight:var(--weight-bold);
  text-transform:uppercase;letter-spacing:var(--tracking-wide);
  color:var(--text-muted);padding:0 6px;margin-left:-6px;
}
`;

/**
 * Groupe de champs façon « group box » : bordure fine, légende dans le trait.
 */
export function Fieldset({ legend, children, style }) {
  ensureStyle('oc-style-fieldset', CSS);
  return (
    <fieldset className="oc-fieldset" style={style}>
      {legend && <legend>{legend}</legend>}
      {children}
    </fieldset>
  );
}
