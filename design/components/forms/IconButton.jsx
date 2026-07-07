import React from 'react';
import { ensureStyle } from '../_style.js';
import { Icon } from '../display/Icon.jsx';

const CSS = `
.oc-iconbtn{
  appearance:none;display:inline-flex;align-items:center;justify-content:center;
  width:var(--control-h);height:var(--control-h);padding:0;border-radius:var(--radius-1);
  background:var(--surface-chrome);color:var(--text-body);
  border:1px solid var(--border-strong);
  box-shadow:var(--bevel-up), var(--shadow-raised);
  cursor:pointer;
}
.oc-iconbtn:hover{background:var(--surface-window)}
.oc-iconbtn:active{box-shadow:var(--bevel-down);transform:translate(2px,2px)}
.oc-iconbtn--ghost{background:transparent;border-color:transparent;box-shadow:none;color:var(--text-muted)}
.oc-iconbtn--ghost:hover{background:var(--surface-chrome);color:var(--text-body)}
.oc-iconbtn--ghost:active{transform:none;box-shadow:var(--bevel-down)}
.oc-iconbtn--sm{width:24px;height:24px}
.oc-iconbtn:disabled{pointer-events:none;opacity:.45;box-shadow:var(--bevel-up)}
`;

/**
 * Bouton carré à icône seule (pixel-art). Toujours donner un aria-label.
 */
export function IconButton({ icon, iconBase, variant = 'default', size = 'md', 'aria-label': ariaLabel, style, ...rest }) {
  ensureStyle('oc-style-iconbtn', CSS);
  const cls = ['oc-iconbtn'];
  if (variant !== 'default') cls.push('oc-iconbtn--' + variant);
  if (size !== 'md') cls.push('oc-iconbtn--' + size);
  return (
    <button className={cls.join(' ')} aria-label={ariaLabel} title={ariaLabel} style={style} {...rest}>
      <Icon name={icon} base={iconBase} size={size === 'sm' ? 14 : 16} />
    </button>
  );
}
