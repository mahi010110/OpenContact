import React from 'react';
import { ensureStyle } from '../_style.js';
import { Icon } from '../display/Icon.jsx';

const CSS = `
.oc-window{
  background:var(--surface-window);
  border:1px solid var(--border-strong);
  border-radius:var(--radius-0);
  box-shadow:var(--shadow-window);
  display:flex;flex-direction:column;min-width:0;
}
.oc-window--flat{box-shadow:var(--shadow-raised)}
.oc-window__bar{
  flex:none;display:flex;align-items:center;gap:8px;
  height:var(--titlebar-h);padding:0 4px 0 10px;
  background:var(--titlebar-bg);color:var(--titlebar-text);
  border-bottom:1px solid var(--border-strong);
  user-select:none;
}
.oc-window__bar--accent{background:var(--titlebar-accent-bg);color:var(--on-navy)}
.oc-window__bar--inactive{
  background:var(--titlebar-inactive-bg);color:var(--titlebar-inactive-text);
  background-image:var(--dither);
}
.oc-window__title{
  flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-family:var(--font-pixel);font-size:var(--pixel-8);font-weight:400;
  text-transform:uppercase;letter-spacing:.1em;
  /* 8px net, sans mise à l'échelle : une police bitmap ne s'agrandit qu'en
     multiples entiers — règle « Silkscreen à 8/16/24 px seulement » */
}
.oc-window__btn{
  flex:none;width:20px;height:20px;padding:0;display:inline-flex;align-items:center;justify-content:center;
  background:var(--surface-chrome);color:var(--ink);
  border:1px solid var(--border-strong);border-radius:var(--radius-1);
  box-shadow:var(--bevel-up);cursor:pointer;
}
.oc-window__btn:active{box-shadow:var(--bevel-down)}
.oc-window__body{padding:var(--space-5);min-width:0}
.oc-window__body--flush{padding:0}
.oc-window__status{
  flex:none;display:flex;align-items:center;gap:12px;
  border-top:1px solid var(--border-soft);
  padding:4px 10px;font-family:var(--font-mono);font-size:var(--text-12);color:var(--text-muted);
}
`;

/**
 * Fenêtre : LE conteneur OpenContact. Barre de titre pixel + corps + barre
 * d'état optionnelle. variant: default (encre) | accent (marine) | inactive (dither).
 */
export function Window({ title, icon, iconBase, variant = 'default', onClose, actions, statusBar, flush, flat, children, style }) {
  ensureStyle('oc-style-window', CSS);
  const barCls = 'oc-window__bar' + (variant !== 'default' ? ' oc-window__bar--' + variant : '');
  return (
    <section className={'oc-window' + (flat ? ' oc-window--flat' : '')} style={style}>
      {title != null && (
        <header className={barCls}>
          {icon && <Icon name={icon} base={iconBase} size={14} style={{ marginRight: -2 }} />}
          <h2 className="oc-window__title" style={{ margin: 0 }}>{title}</h2>
          {actions}
          {onClose && (
            <button className="oc-window__btn" onClick={onClose} aria-label="Fermer">
              <Icon name="close" base={iconBase} size={12} />
            </button>
          )}
        </header>
      )}
      <div className={'oc-window__body' + (flush ? ' oc-window__body--flush' : '')}>{children}</div>
      {statusBar && <footer className="oc-window__status">{statusBar}</footer>}
    </section>
  );
}
