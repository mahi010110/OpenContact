import React from 'react';
import { ensureStyle } from '../_style.js';

const CSS = `
.oc-selbar{
  display:flex;flex-direction:column;gap:8px;
  background:var(--surface-window);
  border:1px solid var(--border-strong);border-radius:var(--radius-0);
  box-shadow:var(--shadow-modal);
  padding:8px 10px;
}
.oc-selbar__row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.oc-selbar__count{
  flex:1;min-width:0;white-space:nowrap;
  font-family:var(--font-mono);font-size:var(--text-12);font-weight:var(--weight-semibold);
  color:var(--text-body);
}
.oc-selbar__actions{display:flex;gap:6px;flex-wrap:wrap}
.oc-selbar__actions>*{flex:1}
`;

/**
 * Barre de sélection multiple : compteur mono + outils (Tout / Aucune /
 * fermer) sur la première ligne, actions groupées en dessous. Le
 * positionnement (fixe, au-dessus de la nav basse) appartient à l'hôte.
 */
export function SelectionBar({ count = 0, countLabel, tools, actions, style }) {
  ensureStyle('oc-style-selbar', CSS);
  const label = countLabel || (count + ' sélectionnée' + (count > 1 ? 's' : ''));
  return (
    <div className="oc-selbar" role="toolbar" aria-label="Sélection de pistes" style={style}>
      <div className="oc-selbar__row">
        <span className="oc-selbar__count">{label}</span>
        {tools}
      </div>
      {actions && <div className="oc-selbar__row oc-selbar__actions">{actions}</div>}
    </div>
  );
}
