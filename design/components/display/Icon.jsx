import React from 'react';
import { ensureStyle } from '../_style.js';

const CSS = `
.oc-icon{
  display:inline-block;flex:none;vertical-align:-2px;
  background-color:currentColor;
  -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
  -webkit-mask-position:center;mask-position:center;
  -webkit-mask-size:contain;mask-size:contain;
  image-rendering:pixelated;
}
`;

/**
 * Icône pixel-art (pixelarticons, 24px de grille) teintée par currentColor.
 * Rendue via mask CSS : hérite de la couleur du texte parent.
 */
export function Icon({ name, size = 16, base = 'assets/icons/', style, ...rest }) {
  ensureStyle('oc-style-icon', CSS);
  const url = `url("${base}${name}.svg")`;
  return (
    <span
      className="oc-icon"
      aria-hidden="true"
      style={{ width: size, height: size, WebkitMaskImage: url, maskImage: url, ...style }}
      {...rest}
    />
  );
}
