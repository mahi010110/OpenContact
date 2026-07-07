import React from 'react';

/* Injecte la feuille du composant une seule fois. */
export function ensureStyle(id, css){
  if (typeof document === 'undefined') return;
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}
