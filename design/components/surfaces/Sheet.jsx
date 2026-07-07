import React from 'react';
import { ensureStyle } from '../_style.js';

const CSS = `
.oc-sheet{
  position:fixed;left:0;right:0;bottom:0;z-index:2500;
  display:flex;flex-direction:column;
  background:var(--surface-window);
  border-top:1px solid var(--border-strong);
  box-shadow:0 -2px 0 0 color-mix(in srgb, var(--ink) 18%, transparent);
  transform:translateY(105%);
  transition:transform var(--dur-3) var(--ease-out);
  max-height:60dvh;
}
.oc-sheet--open{transform:none}
.oc-sheet--full{max-height:calc(100dvh - 56px)}
.oc-sheet__grip{
  appearance:none;width:100%;border:0;cursor:grab;user-select:none;
  display:flex;align-items:center;gap:8px;flex:none;
  height:var(--titlebar-h);padding:0 10px;
  background:var(--titlebar-inactive-bg);background-image:var(--dither);
  color:var(--titlebar-inactive-text);
  border-bottom:1px solid var(--border-strong);
  font-family:var(--font-pixel);font-size:var(--pixel-8);font-weight:400;
  text-transform:uppercase;letter-spacing:.1em;text-align:left;
}
.oc-sheet__handle{width:32px;height:4px;background:var(--ink-3);flex:none;margin-right:2px}
.oc-sheet__title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oc-sheet__count{font-family:var(--font-mono);font-size:var(--text-11);text-transform:none;letter-spacing:0}
.oc-sheet__body{flex:1;min-height:0;overflow-y:auto;padding:var(--space-4)}
.oc-sheet__body--flush{padding:0}
`;

/**
 * Panneau mobile : glisse depuis le bas de l'écran. La poignée est une
 * barre de titre tramée (dither) avec témoin de glissement — un tap la
 * referme, le glisser appartient à l'écran hôte. snap: half (60 dvh) | full.
 */
export function Sheet({ open, onClose, title, count, snap = 'half', flush, children, style }) {
  ensureStyle('oc-style-sheet', CSS);
  const cls = 'oc-sheet' + (open ? ' oc-sheet--open' : '') + (snap === 'full' ? ' oc-sheet--full' : '');
  return (
    <section className={cls} role="dialog" aria-label={title} aria-hidden={!open} style={style}>
      <button type="button" className="oc-sheet__grip" onClick={onClose}
              aria-label={'Fermer ' + (title || 'le panneau')}>
        <span className="oc-sheet__handle" aria-hidden="true" />
        <span className="oc-sheet__title">{title}</span>
        {count != null && <span className="oc-sheet__count">{count}</span>}
      </button>
      <div className={'oc-sheet__body' + (flush ? ' oc-sheet__body--flush' : '')}>{children}</div>
    </section>
  );
}
