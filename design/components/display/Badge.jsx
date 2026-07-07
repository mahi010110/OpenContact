import React from 'react';
import { ensureStyle } from '../_style.js';

const CSS = `
.oc-badge{
  display:inline-flex;align-items:center;gap:4px;
  font-family:var(--font-pixel);font-size:var(--pixel-8);font-weight:400;
  text-transform:uppercase;letter-spacing:.06em;
  padding:3px 6px 2px;border:1px solid currentColor;border-radius:var(--radius-1);
  white-space:nowrap;vertical-align:middle;
}
.oc-badge--neutral{color:var(--text-muted);background:var(--surface-chrome)}
.oc-badge--shared{color:var(--green);background:var(--green-wash)}
.oc-badge--private{color:var(--text-muted);background:var(--surface-chrome);background-image:var(--dither)}
.oc-badge--accent{color:var(--teal);background:var(--teal-wash)}
html[data-theme="dark"] .oc-badge--accent{color:var(--teal)}
.oc-badge--info{color:var(--navy);background:var(--navy-wash)}
html[data-theme="dark"] .oc-badge--info{color:#9AA8F0}
.oc-badge--warn{color:var(--amber);background:var(--amber-wash)}
.oc-badge--danger{color:var(--red);background:var(--red-wash)}
`;

/**
 * Badge pixel : étiquette système en Silkscreen 8px.
 * tone: neutral | shared | private | accent | info | warn | danger.
 */
export function Badge({ tone = 'neutral', children, style, ...rest }) {
  ensureStyle('oc-style-badge', CSS);
  return (
    <span className={'oc-badge oc-badge--' + tone} style={style} {...rest}>
      {children}
    </span>
  );
}
