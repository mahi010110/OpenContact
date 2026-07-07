import React from 'react';
import { ensureStyle } from '../_style.js';
import { Window } from '../surfaces/Window.jsx';
import { Icon } from '../display/Icon.jsx';

const CSS = `
.oc-empty{text-align:center}
.oc-empty__heading{
  font-family:var(--font-ui);font-size:var(--text-16);font-weight:var(--weight-bold);
  letter-spacing:var(--tracking-tight);margin:0 0 4px;
}
.oc-empty__desc{font-size:var(--text-13);color:var(--text-muted);line-height:var(--leading-body);margin:0 0 var(--space-5)}
.oc-empty__principles{display:flex;justify-content:center;gap:var(--space-6);margin:0 0 var(--space-5)}
.oc-empty__principle{
  display:flex;flex-direction:column;align-items:center;gap:6px;
  font-size:var(--text-12);font-weight:var(--weight-semibold);color:var(--text-muted);
}
.oc-empty__principle .oc-icon{color:var(--accent)}
.oc-empty__actions{display:flex;flex-direction:column;gap:8px}
.oc-empty__actions>*{width:100%}
`;

/**
 * État vide : une fenêtre centrée qui porte la promesse du produit —
 * trio de principes (icône + verbe), puis les actions empilées,
 * la primaire en premier.
 */
export function EmptyState({ title = 'OpenContact', heading, description, principles = [], actions, iconBase, style }) {
  ensureStyle('oc-style-empty', CSS);
  return (
    <Window title={title} style={{ maxWidth: 420, width: '100%', ...style }}>
      <div className="oc-empty">
        {heading && <h3 className="oc-empty__heading">{heading}</h3>}
        {description && <p className="oc-empty__desc">{description}</p>}
        {principles.length > 0 && (
          <div className="oc-empty__principles">
            {principles.map((p) => (
              <span key={p.label} className="oc-empty__principle">
                <Icon name={p.icon} base={iconBase} size={24} />
                <span>{p.label}</span>
              </span>
            ))}
          </div>
        )}
        {actions && <div className="oc-empty__actions">{actions}</div>}
      </div>
    </Window>
  );
}
