import React from 'react';
import { ensureStyle } from '../_style.js';
import { Icon } from '../display/Icon.jsx';

const CSS = `
.oc-bottomnav{
  position:fixed;left:0;right:0;bottom:0;z-index:1500;
  display:flex;align-items:stretch;gap:2px;
  background:var(--surface-chrome);
  border-top:1px solid var(--border-strong);
  padding:4px calc(4px + env(safe-area-inset-right)) calc(4px + env(safe-area-inset-bottom)) calc(4px + env(safe-area-inset-left));
}
.oc-bottomnav__item{
  flex:1;min-width:0;min-height:var(--control-h-touch);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  font-family:var(--font-ui);font-size:var(--text-11);font-weight:var(--weight-semibold);
  color:var(--text-muted);text-decoration:none;
  border:1px solid transparent;border-radius:var(--radius-1);
}
.oc-bottomnav__item--active{background:var(--select-bg);color:var(--select-text);border-color:var(--border-strong)}
.oc-bottomnav__add{
  flex:none;width:52px;min-height:var(--control-h-touch);margin:0 2px;align-self:stretch;
  display:inline-flex;align-items:center;justify-content:center;
  background:var(--accent);color:var(--on-accent);
  border:1px solid var(--border-strong);border-radius:var(--radius-1);
  box-shadow:var(--bevel-up), var(--shadow-raised);cursor:pointer;
}
.oc-bottomnav__add:active{box-shadow:var(--bevel-down);transform:translate(1px,1px)}
`;

/**
 * Navigation basse mobile : onglets plats (actif = sélection marine),
 * bouton d'ajout carré biseauté au centre — jamais de cercle flottant.
 * Cibles >= 44px, zones de sécurité (encoche) gérées.
 */
export function BottomNav({ items = [], onAdd, addLabel = 'Ajouter une piste', addIcon = 'plus', iconBase, style }) {
  ensureStyle('oc-style-bottomnav', CSS);
  const half = Math.ceil(items.length / 2);
  const renderItem = (it) => (
    <a key={it.label} href={it.href || '#'} onClick={it.onClick}
       className={'oc-bottomnav__item' + (it.active ? ' oc-bottomnav__item--active' : '')}
       aria-current={it.active ? 'page' : undefined}>
      <Icon name={it.icon} base={iconBase} size={16} />
      <span>{it.label}</span>
    </a>
  );
  return (
    <nav className="oc-bottomnav" aria-label="Navigation principale" style={style}>
      {items.slice(0, half).map(renderItem)}
      {onAdd && (
        <button type="button" className="oc-bottomnav__add" onClick={onAdd} aria-label={addLabel} title={addLabel}>
          <Icon name={addIcon} base={iconBase} size={20} />
        </button>
      )}
      {items.slice(half).map(renderItem)}
    </nav>
  );
}
