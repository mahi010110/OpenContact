/* ============================================================
   OpenContact — interface · CV & lettres (variantes nommées, #4)
   Le profil range 0..n documents PDF nommés (« CV cyber », « LM
   générale »…), sur CET appareil (oc_docs_v1). Les clés héritées
   cv / lettre restent des variantes comme les autres. Utilisé par
   « Moi » (gestion) et le composeur (pièces jointes réelles).
   ============================================================ */
import { docList, docPut, docDel } from '../engine/storage.js';
import { uid } from '../engine/utils.js';
import { toast } from './dom.js';

export const DOC_MAX = 8 * 1048576;   /* 8 Mo par PDF */

export const docKind = key => (key === 'cv' || String(key).startsWith('cv_')) ? 'cv' : 'lm';
export const docTitle = d => String(d.name || '').replace(/\.pdf$/i, '')
  || (docKind(d.key) === 'cv' ? 'Mon CV' : 'Ma lettre');

export async function listDocs(){
  try { return (await docList()).filter(d => d && d.blob); }
  catch (e) { return []; }
}

/* choisir un PDF et le ranger comme variante — onDone(clé) au succès */
export function pickPdf(kind, onDone){
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/pdf';
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    if (f.size > DOC_MAX){ toast('Trop lourd (8 Mo max) — allège le PDF.'); return; }
    const key = kind + '_' + uid();
    try {
      await docPut(key, { name: f.name, size: f.size, type: f.type, added: Date.now(), blob: f });
      toast('Document rangé.');
      if (onDone) onDone(key);
    } catch (e) { toast('Stockage indisponible sur ce navigateur.'); }
  });
  inp.click();
}

export const removeDoc = key => docDel(key);
