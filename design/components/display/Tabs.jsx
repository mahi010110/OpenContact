import React from 'react';
import { ensureStyle } from '../_style.js';

const CSS = `
.oc-tabs{display:flex;flex-direction:column;min-width:0}
.oc-tabs__row{display:flex;gap:2px;padding:0 var(--space-3);position:relative;z-index:1}
.oc-tabs__tab{
  appearance:none;cursor:pointer;
  font-family:var(--font-ui);font-size:var(--text-13);font-weight:var(--weight-semibold);
  color:var(--text-muted);
  padding:7px 14px;border:1px solid var(--border-strong);border-bottom:0;
  border-radius:var(--radius-1) var(--radius-1) 0 0;
  background:var(--surface-chrome);background-image:var(--dither);
  margin-bottom:0;position:relative;top:1px;
}
.oc-tabs__tab[aria-selected="true"]{
  background:var(--surface-window);background-image:none;color:var(--text-body);
  padding-top:9px;top:1px;
}
.oc-tabs__panel{
  border:1px solid var(--border-strong);background:var(--surface-window);
  padding:var(--space-5);box-shadow:var(--shadow-raised);
}
`;

/**
 * Onglets « dossier » : l'onglet actif fusionne avec son panneau,
 * les inactifs sont tramés.
 */
export function Tabs({ tabs = [], active, onChange, children, style }) {
  ensureStyle('oc-style-tabs', CSS);
  const idx = active ?? 0;
  return (
    <div className="oc-tabs" style={style}>
      <div className="oc-tabs__row" role="tablist">
        {tabs.map((t, i) => (
          <button key={t} role="tab" aria-selected={i === idx} className="oc-tabs__tab"
                  onClick={() => onChange && onChange(i)}>
            {t}
          </button>
        ))}
      </div>
      <div className="oc-tabs__panel" role="tabpanel">
        {Array.isArray(children) ? children[idx] : children}
      </div>
    </div>
  );
}
