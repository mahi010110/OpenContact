import React from 'react';
import { ensureStyle } from '../_style.js';

const CSS = `
.oc-chip{
  display:inline-flex;align-items:center;gap:5px;
  font-family:var(--font-mono);font-size:var(--text-12);font-weight:var(--weight-medium);
  padding:2px 7px;border:1px solid var(--border-soft);border-radius:var(--radius-1);
  background:var(--surface-chrome);color:var(--text-body);white-space:nowrap;
}
.oc-chip__x{
  appearance:none;border:0;background:none;padding:0;margin:0 -2px 0 1px;cursor:pointer;
  color:var(--text-muted);font-size:11px;line-height:1;font-family:var(--font-ui);
}
.oc-chip__x:hover{color:var(--red)}
.oc-chip--dot::before{content:'';width:6px;height:6px;background:var(--chip-dot,var(--teal));flex:none}
`;

/**
 * Chip de donnée (mono) : technos, villes, tags. Point carré coloré optionnel.
 */
export function Chip({ children, dot, dotColor, onRemove, style, ...rest }) {
  ensureStyle('oc-style-chip', CSS);
  return (
    <span className={'oc-chip' + (dot ? ' oc-chip--dot' : '')}
          style={{ ...(dotColor ? { '--chip-dot': dotColor } : null), ...style }} {...rest}>
      {children}
      {onRemove && <button className="oc-chip__x" onClick={onRemove} aria-label="Retirer">✕</button>}
    </span>
  );
}
