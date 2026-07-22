/* ============================================================
   OpenContact — interface · champ de gabarit sans code (#17)
   Jamais de {{...}} à l'écran : l'utilisateur voit un vrai texte
   rempli. Les bouts qui changent selon la personne (prénom,
   entreprise…) sont des jetons insécables surlignés en douceur,
   remplis d'un exemple réel ; le reste s'écrit en texte normal.
   À l'enregistrement, le gabarit {{...}} d'origine est resérialisé
   — le format stocké ne change pas. Sert au wizard de campagne et
   aux modèles d'emails.
   ============================================================ */
import { esc } from '../engine/utils.js';
import { S } from './state.js';

/* quand une valeur d'exemple manque, le jeton se lit en français —
   la même table nomme les jetons insérables (« Insérer : … ») */
export const TPL_LABELS = {
  contact: 'la personne', entreprise: 'l’entreprise', ville: 'la ville',
  moi: 'ton nom', formation: 'ta formation', tel: 'ton téléphone',
  email: 'ton email', cv: 'ton CV', portfolio: 'ton portfolio'
};
const FALLBACK = TPL_LABELS;

/* les valeurs d'exemple : la 1ʳᵉ cible réelle quand on l'a, le profil sinon */
export function tplSample(company, ct){
  const p = S.profile || {};
  return {
    entreprise: (company && company.name) || '',
    contact: (ct && ct.name) || '',
    ville: (company && company.city) || '',
    moi: p.name || '', formation: p.formation || '',
    tel: p.phone || '', email: p.email || '',
    cv: p.cvUrl || '', portfolio: p.portfolio || ''
  };
}

export function tplField(el, o){
  o = o || {};
  const sample = o.sample || {};
  el.classList.add('tpl-field');
  if (o.multiline === false) el.classList.add('tpl-single');
  el.contentEditable = 'true';
  el.spellcheck = false;

  const render = tpl => {
    el.innerHTML = String(tpl || '').split(/(\{\{\w+\}\})/g).map(part => {
      const m = /^\{\{(\w+)\}\}$/.exec(part);
      if (!m) return esc(part);
      const k = m[1];
      const v = sample[k] || FALLBACK[k] || k;
      return `<span class="tvar" data-k="${esc(k)}" contenteditable="false"
                    title="Se remplit tout seul selon la personne">${esc(v)}</span>`;
    }).join('');
  };
  render(o.value);

  /* coller = texte brut, jamais du HTML étranger */
  el.addEventListener('paste', e => {
    e.preventDefault();
    const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, txt);
  });
  if (o.multiline === false){
    el.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
  }

  return {
    el,
    set: render,
    /* insère un jeton au curseur (ou en fin de champ) — le geste des
       boutons « Insérer : la personne · l'entreprise · … » */
    insert(k){
      const span = document.createElement('span');
      span.className = 'tvar';
      span.dataset.k = k;
      span.contentEditable = 'false';
      span.title = 'Se remplit tout seul selon la personne';
      span.textContent = sample[k] || FALLBACK[k] || k;
      const s = window.getSelection();
      if (s && s.rangeCount && el.contains(s.anchorNode)){
        const r = s.getRangeAt(0);
        r.deleteContents();
        r.insertNode(span);
        r.setStartAfter(span);
        r.collapse(true);
        s.removeAllRanges();
        s.addRange(r);
      } else {
        el.append(span);
      }
    },
    /* resérialise le gabarit : texte tel quel, jetons → {{clé}} */
    get(){
      let out = '';
      const walk = n => {
        for (const ch of n.childNodes){
          if (ch.nodeType === 3){ out += ch.nodeValue; continue; }
          if (ch.nodeType !== 1) continue;
          if (ch.classList && ch.classList.contains('tvar')){ out += '{{' + ch.dataset.k + '}}'; continue; }
          if (ch.tagName === 'BR'){ out += '\n'; continue; }
          /* les blocs (div/p) que le navigateur crée à Entrée = retours */
          if (out && !out.endsWith('\n')) out += '\n';
          walk(ch);
        }
      };
      walk(el);
      return out;
    }
  };
}
