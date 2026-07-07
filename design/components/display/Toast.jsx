import React from 'react';
import { ensureStyle } from '../_style.js';
import { Icon } from './Icon.jsx';

const CSS = `
.oc-toast{
  display:inline-flex;align-items:center;gap:8px;
  background:var(--surface-window);color:var(--text-body);
  border:1px solid var(--border-strong);border-radius:var(--radius-0);
  box-shadow:var(--shadow-raised);
  padding:8px 12px;
  font-family:var(--font-mono);font-size:var(--text-12);
  animation:oc-toast-in var(--dur-2) var(--ease-steps);
}
@keyframes oc-toast-in{from{opacity:0;transform:translateY(4px)}}
.oc-toast__led{width:8px;height:8px;flex:none;border:1px solid var(--border-strong)}
.oc-toast--info .oc-toast__led{background:var(--teal)}
.oc-toast--ok .oc-toast__led{background:var(--green)}
.oc-toast--warn .oc-toast__led{background:var(--amber)}
.oc-toast--error .oc-toast__led{background:var(--red)}
`;

/**
 * Message système : ligne mono avec LED carrée de statut.
 * Le ton du texte est factuel : « Fichier enregistré. »
 */
export function Toast({ tone = 'info', icon, iconBase, children, style }) {
  ensureStyle('oc-style-toast', CSS);
  return (
    <div className={'oc-toast oc-toast--' + tone} role="status" style={style}>
      <span className="oc-toast__led" aria-hidden="true" />
      {icon && <Icon name={icon} base={iconBase} size={14} />}
      <span>{children}</span>
    </div>
  );
}
