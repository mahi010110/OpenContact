import React from 'react';
import { ensureStyle } from '../_style.js';
import { Window } from './Window.jsx';

const CSS = `
.oc-overlay{
  position:fixed;inset:0;z-index:3000;
  display:flex;align-items:center;justify-content:center;padding:22px;
  background:color-mix(in srgb, var(--ink) 20%, transparent);
}
.oc-overlay::before{content:'';position:absolute;inset:0;background:var(--dither-strong)}
.oc-overlay>*{position:relative;animation:oc-dialog-in var(--dur-3) var(--ease-out)}
@keyframes oc-dialog-in{from{opacity:0;transform:scale(.98)}}
.oc-dialog__foot{
  display:flex;gap:8px;justify-content:flex-end;
  border-top:1px solid var(--border-soft);
  margin:var(--space-5) calc(-1 * var(--space-5)) calc(-1 * var(--space-5));
  padding:var(--space-4) var(--space-5);
  background:var(--surface-chrome);
}
`;

/**
 * Modale : fenêtre accent posée sur un voile tramé (le dither fait le dim).
 */
export function Dialog({ open, title, icon, iconBase, onClose, footer, width = 480, children }) {
  ensureStyle('oc-style-dialog', CSS);
  if (!open) return null;
  return (
    <div className="oc-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <Window title={title} icon={icon} iconBase={iconBase} variant="accent" onClose={onClose}
              style={{ width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--shadow-modal)' }}>
        {children}
        {footer && <div className="oc-dialog__foot">{footer}</div>}
      </Window>
    </div>
  );
}
