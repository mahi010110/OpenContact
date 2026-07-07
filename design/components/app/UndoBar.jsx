import React from 'react';
import { ensureStyle } from '../_style.js';
import { Button } from '../forms/Button.jsx';
import { IconButton } from '../forms/IconButton.jsx';

const CSS = `
.oc-undobar{
  display:flex;align-items:center;gap:10px;
  background:var(--surface-window);color:var(--text-body);
  border:1px solid var(--border-strong);border-radius:var(--radius-0);
  box-shadow:var(--shadow-modal);
  padding:8px 8px 8px 12px;
  font-family:var(--font-mono);font-size:var(--text-12);
}
.oc-undobar__led{width:8px;height:8px;flex:none;border:1px solid var(--border-strong);background:var(--amber)}
.oc-undobar__msg{flex:1;min-width:0;line-height:var(--leading-ui)}
`;

/**
 * Filet de sécurité après une fusion ou une restauration : message factuel
 * en mono, LED ambre, action « Annuler » et fermeture. La minuterie
 * (~30 s) et le positionnement appartiennent à l'hôte.
 */
export function UndoBar({ message, actionLabel = 'Annuler', onAction, onDismiss, iconBase, style }) {
  ensureStyle('oc-style-undobar', CSS);
  return (
    <div className="oc-undobar" role="status" style={style}>
      <span className="oc-undobar__led" aria-hidden="true" />
      <span className="oc-undobar__msg">{message}</span>
      <Button variant="primary" size="sm" onClick={onAction}>{actionLabel}</Button>
      {onDismiss && (
        <IconButton icon="close" iconBase={iconBase} variant="ghost" size="sm"
                    aria-label="Fermer sans annuler" onClick={onDismiss} />
      )}
    </div>
  );
}
