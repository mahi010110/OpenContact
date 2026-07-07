import React from 'react';
import { ensureStyle } from '../_style.js';

const CSS = `
.oc-score{
  display:inline-flex;align-items:center;justify-content:center;
  min-width:32px;height:18px;padding:0 5px;
  font-family:var(--font-mono);font-size:var(--text-11);font-weight:var(--weight-semibold);
  border:1px solid currentColor;border-radius:var(--radius-1);
  white-space:nowrap;line-height:1;
}
button.oc-score{appearance:none;cursor:pointer}
.oc-score--ok{color:var(--green);background:var(--green-wash)}
.oc-score--mid{color:var(--amber);background:var(--amber-wash)}
.oc-score--low{color:var(--red);background:var(--red-wash)}
`;

/**
 * Indice de complétude d'une fiche (0–100) : pastille mono, texte sombre
 * sur lavis — vert dès 70, ambre dès 40, rouge sinon. Rendue en <button>
 * si onClick est fourni (l'explication s'affiche au tap).
 * C'est un indicateur d'entretien de la fiche, pas une garantie.
 */
export function Score({ value = 0, onClick, style, ...rest }) {
  ensureStyle('oc-style-score', CSS);
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const tone = v >= 70 ? 'ok' : v >= 40 ? 'mid' : 'low';
  const cls = 'oc-score oc-score--' + tone;
  const label = 'Complétude ' + v + ' sur 100';
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}
              aria-label={label + " — toucher pour l'explication"} style={style} {...rest}>{v}</button>
    );
  }
  return <span className={cls} role="img" aria-label={label} style={style} {...rest}>{v}</span>;
}
