import React from 'react';
import { ensureStyle } from '../_style.js';

const CSS = `
.oc-field{display:block;margin:0}
.oc-field__label{
  display:block;font-size:var(--text-11);font-weight:var(--weight-bold);
  text-transform:uppercase;letter-spacing:var(--tracking-wide);
  color:var(--text-muted);margin-bottom:4px;
}
.oc-field__hint{font-size:var(--text-12);color:var(--text-muted);margin-top:4px;line-height:var(--leading-body)}
.oc-field__hint--error{color:var(--red)}
`;

/**
 * Enveloppe de champ : étiquette en petites capitales + aide/erreur dessous.
 */
export function Field({ label, hint, error, children, style }) {
  ensureStyle('oc-style-field', CSS);
  return (
    <label className="oc-field" style={style}>
      {label && <span className="oc-field__label">{label}</span>}
      {children}
      {(error || hint) && (
        <span className={'oc-field__hint' + (error ? ' oc-field__hint--error' : '')}>{error || hint}</span>
      )}
    </label>
  );
}
