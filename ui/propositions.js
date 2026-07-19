/* ============================================================
   OpenContact — interface · propositions de l'assistant IA (P8-2)
   Un assistant IA compatible, branché sur le Compagnon, peut
   déposer des propositions de pistes. Elles n'écrivent JAMAIS
   rien : ce module les rapporte ici, les garde scellées
   (`oc_proposals_v1`) et les fait passer par le même aperçu
   multi-sélection que tout contenu reçu — fusion sans écrasement,
   Annuler ~30 s, ou écart explicite. Fermer l'aperçu ne consomme
   rien ; seule une fusion ou un écart règle une proposition.
   Il pousse aussi au Compagnon le résumé en liste blanche
   (engine/mcp.js) que l'assistant a le droit de lire.
   ============================================================ */
import { PROPOSALS_KEY, kvGet, kvSet, kvDel } from '../engine/storage.js';
import { parseInput } from '../engine/exchange.js';
import { probeCompanion, companionCall } from '../engine/companion.js';
import { buildMcpResume } from '../engine/mcp.js';
import { S, bus, logJ } from './state.js';
import { openSheet, toast, showUndo, ic } from './dom.js';
import { loadCompanion } from './compagnon.js';

const LIST_MAX = 5;      /* propositions en attente, au plus */
const DONE_MAX = 50;     /* pids déjà réglés, gardés pour l'idempotence */
const PID_RE = /^[A-Za-z0-9._-]{4,64}$/;

const listeners = new Set();
let current = null;
let loaded = false;

/* Forme normalisée : { v:1, actif, list:[{pid, at, n, share}], done:[{pid, a}] }.
   `actif` mémorise que l'assistant a été autorisé : tant qu'il est faux,
   la PWA ne sonde jamais le Compagnon pour rien. Un pid réglé prime sur
   une entrée en attente — rejouer une proposition déjà fusionnée ou
   écartée ne la fait jamais réapparaître. */
export function normaliseProposals(value){
  if (!value || typeof value !== 'object') return null;
  const out = { v: 1, actif: !!value.actif, list: [], done: [] };
  const seen = new Set();
  for (const d of (Array.isArray(value.done) ? value.done : [])){
    const pid = String((d && d.pid) || d || '');
    if (!PID_RE.test(pid) || seen.has(pid)) continue;
    seen.add(pid);
    out.done.push({ pid, a: (d && d.a) === 'abandon' ? 'abandon' : 'fusion' });
    if (out.done.length >= DONE_MAX) break;
  }
  for (const e of (Array.isArray(value.list) ? value.list : [])){
    if (!e || typeof e !== 'object') continue;
    const pid = String(e.pid || '');
    if (!PID_RE.test(pid) || seen.has(pid)) continue;
    if (typeof e.share !== 'string' || !e.share.trim() || e.share.length > 4000000) continue;
    const n = Number(e.n);
    if (!(n >= 1 && n <= 2000)) continue;
    seen.add(pid);
    out.list.push({ pid, at: Number(e.at) || 0, n: Math.floor(n), share: e.share });
    if (out.list.length >= LIST_MAX) break;
  }
  out.list.sort((a, b) => a.at - b.at || a.pid.localeCompare(b.pid));
  return (out.list.length || out.done.length || out.actif) ? out : null;
}

function emit(){
  for (const fn of listeners){ try { fn(current); } catch (e) {} }
  bus.refresh();
}
async function persist(next){
  current = normaliseProposals(next);
  const ok = current
    ? await kvSet(PROPOSALS_KEY, JSON.stringify(current))
    : await kvDel(PROPOSALS_KEY);
  emit();
  return ok;
}

export async function loadProposals(){
  if (loaded) return current;
  loaded = true;
  let raw = null;
  try { raw = await kvGet(PROPOSALS_KEY); } catch (e) {}
  try { current = normaliseProposals(JSON.parse(raw || 'null')); } catch (e) { current = null; }
  return current;
}
export const pendingProposals = () => (current && current.list) || [];
export function subscribeProposals(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* réglée = fusionnée ou écartée — retirée d'ici, mémorisée dans `done`,
   et le Compagnon est prévenu (best effort, re-tenté au prochain tour) */
async function consumeProposal(pid, action){
  const rec = pendingProposals().find(p => p.pid === pid);
  if (!rec) return null;
  const next = {
    v: 1,
    actif: !!(current && current.actif),
    list: pendingProposals().filter(p => p.pid !== pid),
    done: [{ pid, a: action }].concat((current && current.done) || [])
  };
  await persist(next);
  ack(pid, action).catch(() => {});
  return rec;
}
async function restoreProposal(rec){
  if (!rec) return;
  await persist({
    v: 1,
    actif: !!(current && current.actif),
    list: pendingProposals().concat([rec]),
    done: ((current && current.done) || []).filter(d => d.pid !== rec.pid)
  });
}
/* la feuille du Compagnon a autorisé ou coupé l'assistant : c'est ce
   souvenir qui permet — ou interdit — les sondes en arrière-plan */
export async function setAssistantActive(on){
  await loadProposals();
  await persist({
    v: 1, actif: !!on,
    list: pendingProposals(),
    done: (current && current.done) || []
  });
}
async function ack(pid, action){
  const assoc = await loadCompanion().catch(() => null);
  if (!assoc) return;
  const found = await probeCompanion();
  if (!found) return;
  await companionCall(found.base, assoc.k, { t: 'proposition-reglee', pid, action });
}

/* ---------- la conversation avec le Compagnon ---------- */
let job = null;
let lastResume = '';
let lastRun = 0;

/* Rapporte les propositions en attente chez le Compagnon (dédupliquées
   par pid, celles déjà réglées re-signalées) et pousse le résumé en
   liste blanche. Ne sonde JAMAIS tant que l'assistant n'a pas été
   autorisé ici, ni sans association : silence total. */
export async function reconcileProposals(){
  if (job) return job;
  job = (async () => {
    await loadProposals();
    if (!current || !current.actif) return current;
    const assoc = await loadCompanion().catch(() => null);
    if (!assoc) return current;
    const found = await probeCompanion();
    if (!found) return current;
    let rep;
    try { rep = await companionCall(found.base, assoc.k, { t: 'propositions' }); }
    catch (e) { return current; }
    if (!rep || rep.t !== 'propositions') return current;
    const done = new Set(((current && current.done) || []).map(d => d.pid));
    const known = new Set(pendingProposals().map(p => p.pid));
    let next = null;
    for (const e of (Array.isArray(rep.liste) ? rep.liste : []).slice(0, LIST_MAX)){
      const pid = String((e && e.pid) || '');
      if (!PID_RE.test(pid) || known.has(pid)) continue;
      if (done.has(pid)){
        /* déjà fusionnée ou écartée ici — on le redit, jamais deux aperçus */
        const a = ((current && current.done) || []).find(d => d.pid === pid);
        ack(pid, (a && a.a) || 'fusion').catch(() => {});
        continue;
      }
      const share = String((e && e.share) || '');
      let n = 0;
      try {
        const obj = await parseInput(share);
        n = obj.companies.length;
      } catch (err) { continue; }   /* illisible : jamais rangée */
      if (!n) continue;
      next = next || { v: 1, actif: current.actif, list: pendingProposals().slice(),
        done: (current && current.done) || [] };
      next.list.push({ pid, at: Number(e.at) || Date.now(), n, share });
      known.add(pid);
    }
    if (next) await persist(next);
    if (!rep.actif){
      /* coupé côté Compagnon (ou association refaite) : on cesse de sonder */
      if (current && current.actif) await persist(Object.assign({}, current, { actif: false }));
    } else {
      const resume = JSON.stringify(buildMcpResume(S.companies));
      if (resume !== lastResume){
        try {
          const r2 = await companionCall(found.base, assoc.k,
            { t: 'resume', resume: JSON.parse(resume) });
          if (r2 && r2.t === 'ok') lastResume = resume;
        } catch (e) {}
      }
    }
    return current;
  })().finally(() => { job = null; });
  return job;
}

/* au démarrage puis en continu, sobrement : toutes les 90 s, et au plus
   tôt 15 s après un enregistrement (le résumé suit les pistes) */
export function startProposalsLoop(){
  const tick = () => {
    if (Date.now() - lastRun < 15000) return;
    lastRun = Date.now();
    reconcileProposals().catch(() => {});
  };
  tick();
  setInterval(tick, 90000);
  document.addEventListener('oc:change', () => { setTimeout(tick, 2000); });
}

/* ---------- l'aperçu (chip d'Aujourd'hui) ---------- */
export async function openPendingProposals(){
  await loadProposals();
  const rec = pendingProposals()[0];
  if (!rec){ toast('Aucune proposition à trier.'); return; }
  const sh = openSheet({ title: 'Pistes proposées', icon: 'sparkles' });
  sh.body.innerHTML = `<p class="hint">${ic('clock', 'ic-14')} Ouverture…</p>`;
  let obj;
  try { obj = await parseInput(rec.share); }
  catch (e) {
    await consumeProposal(rec.pid, 'abandon');
    toast('Cette proposition ne peut plus être lue — écartée.');
    sh.close();
    return;
  }
  const { mergePreviewInto } = await import('./recevoir.js');
  mergePreviewInto(sh, obj, {
    select: true,
    onCancel: () => sh.close(),
    onDone: () => {
      consumeProposal(rec.pid, 'fusion').catch(() => {});
      logJ('Propositions de l’assistant fusionnées (' + rec.n + ' piste' + (rec.n > 1 ? 's' : '') + ')');
    },
    onDiscard: async () => {
      const kept = await consumeProposal(rec.pid, 'abandon');
      logJ('Propositions de l’assistant écartées');
      sh.close();
      showUndo(`${ic('check', 'ic-14')} Propositions écartées.`, () => {
        restoreProposal(kept).then(() => toast('Propositions retrouvées — elles t’attendent dans Aujourd’hui.'));
      });
    }
  });
}
