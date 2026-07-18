/* ============================================================
   OpenContact — interface · analyses d'e-mails en attente
   Une mission mail-scan peut finir pendant que la feuille, l'onglet
   ou l'application est fermé. On mémorise donc son identifiant AVANT
   de la confier, puis on reprend l'interrogation du Compagnon après
   déverrouillage. Le résultat reste une enveloppe `share` ordinaire :
   ce module la valide et la garde scellée, mais ne fusionne rien.
   ============================================================ */
import { ANALYSIS_KEY, kvGet, kvSet, kvDel } from '../engine/storage.js';
import { parseInput } from '../engine/exchange.js';
import { probeCompanion, companionCall } from '../engine/companion.js';
import { bus } from './state.js';
import { loadCompanion } from './compagnon.js';

const ACTIVE = new Set(['sending', 'running']);
const TWO_DAYS = 2 * 86400000;       /* même durée que la mission mail-scan */
const listeners = new Set();
let current = null;
let loaded = false;
let timer = null;
let job = null;

/* Forme volontairement petite : une seule « dernière analyse » peut
   attendre. Une nouvelle lecture ne remplace jamais silencieusement
   une proposition encore à trier. */
export function normaliseMailAnalysis(value, now){
  now = Number(now) || Date.now();
  if (!value || typeof value !== 'object' || typeof value.mid !== 'string' || !value.mid) return null;
  const state = ['sending', 'running', 'ready', 'error'].includes(value.state) ? value.state : 'error';
  const startedAt = Number(value.startedAt) || now;
  const rec = {
    v: 1,
    mid: value.mid.slice(0, 100),
    days: Math.max(1, Math.min(90, Number(value.days) || 7)),
    state,
    startedAt,
    expiresAt: Number(value.expiresAt) || (startedAt + TWO_DAYS)
  };
  if (state === 'ready'){
    if (typeof value.result !== 'string' || !value.result.trim()) return null;
    rec.result = value.result;
    rec.count = Math.max(0, Math.min(2000, Number(value.count) || 0));
    rec.finishedAt = Number(value.finishedAt) || now;
  }
  if (state === 'error') rec.error = String(value.error || 'Cette analyse n’a pas abouti.').slice(0, 240);
  if (ACTIVE.has(rec.state) && now >= rec.expiresAt){
    rec.state = 'error';
    rec.error = 'Cette analyse a expiré avant de rendre un résultat.';
  }
  return rec;
}

function emit(){
  for (const fn of listeners){ try { fn(current); } catch (e) {} }
  bus.refresh();
}
async function persist(next){
  current = normaliseMailAnalysis(next);
  const ok = current
    ? await kvSet(ANALYSIS_KEY, JSON.stringify(current))
    : await kvDel(ANALYSIS_KEY);
  emit();
  return ok;
}
function schedule(delay){
  if (timer || !current || !ACTIVE.has(current.state)) return;
  timer = setTimeout(() => {
    timer = null;
    reconcileMailAnalysis().catch(() => {});
  }, delay == null ? 1200 : delay);
}

export async function loadMailAnalysis(){
  if (loaded) return current;
  let raw = null;
  try { raw = await kvGet(ANALYSIS_KEY); } catch (e) {}
  let parsed = null;
  try { parsed = JSON.parse(raw || 'null'); } catch (e) {}
  current = normaliseMailAnalysis(parsed);
  loaded = true;
  /* Si la normalisation a constaté une expiration, on la rend durable. */
  if (current && JSON.stringify(current) !== JSON.stringify(parsed))
    await kvSet(ANALYSIS_KEY, JSON.stringify(current));
  schedule(250);
  return current;
}

export function mailAnalysis(){ return current; }
export function subscribeMailAnalysis(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* Écrit AVANT l'appel réseau : même si l'app disparaît juste après que
   le Compagnon a accepté le bon, son `mid` reste retrouvable. */
export async function beginMailAnalysis(rec){
  await loadMailAnalysis();
  if (current && (ACTIVE.has(current.state) || current.state === 'ready')) throw new Error('analyse-en-attente');
  const next = normaliseMailAnalysis({
    mid: rec.mid, days: rec.days, state: 'sending', startedAt: rec.startedAt,
    expiresAt: rec.expiresAt
  });
  const ok = await persist(next);
  if (!ok){ current = null; emit(); throw new Error('stockage'); }
  schedule(0);
  return current;
}

export async function markMailAnalysisRunning(mid){
  if (!current || current.mid !== mid || !ACTIVE.has(current.state)) return current;
  await persist(Object.assign({}, current, { state: 'running' }));
  schedule(0);
  return current;
}

export async function failMailAnalysis(mid, message){
  if (!current || current.mid !== mid) return current;
  await persist(Object.assign({}, current, {
    state: 'error', error: String(message || 'Cette analyse n’a pas abouti.').slice(0, 240)
  }));
  return current;
}

export async function clearMailAnalysis(mid){
  if (mid && (!current || current.mid !== mid)) return false;
  if (timer){ clearTimeout(timer); timer = null; }
  await persist(null);
  return true;
}

/* Une seule interrogation à la fois, y compris si la feuille et le
   réveil d'arrière-plan demandent la reprise au même moment. */
export async function reconcileMailAnalysis(){
  await loadMailAnalysis();
  if (!current || !ACTIVE.has(current.state)) return current;
  if (Date.now() >= current.expiresAt){
    await failMailAnalysis(current.mid, 'Cette analyse a expiré avant de rendre un résultat.');
    return current;
  }
  if (job){ await job; return current; }
  const mid = current.mid;
  job = (async () => {
    const assoc = await loadCompanion().catch(() => null);
    if (!assoc) return { delay: 10000 };
    const found = await probeCompanion();
    if (!found) return { delay: 10000 };
    let rep;
    try { rep = await companionCall(found.base, assoc.k, { t: 'analyse-etat', mid }); }
    catch (e) { return { delay: 6000 }; }
    /* Une ancienne interrogation peut finir après « oublier » puis une
       nouvelle analyse : sa réponse ne doit jamais contaminer le nouveau mid. */
    if (!current || current.mid !== mid || !ACTIVE.has(current.state)) return { delay: 0 };
    if (!rep || rep.etat === 'en cours' || rep.etat === 'inconnue') return { delay: 1800 };
    if (rep.etat === 'annulee'){
      await clearMailAnalysis(mid);
      return { delay: 0 };
    }
    if (rep.etat === 'erreur'){
      await failMailAnalysis(mid, rep.e || 'L’analyse locale n’a pas répondu.');
      return { delay: 0 };
    }
    if (rep.etat !== 'fini') return { delay: 4000 };
    const raw = String(rep.resultat || '');
    try {
      const obj = await parseInput(raw);
      const count = Array.isArray(obj && obj.companies) ? obj.companies.length : 0;
      if (!count) throw new Error('vide');
      await persist(Object.assign({}, current, {
        state: 'ready', result: raw, count, finishedAt: Date.now()
      }));
    } catch (e) {
      await failMailAnalysis(mid,
        e && e.message === 'vide' ? 'L’analyse n’a proposé aucune piste.' : 'Le résultat de l’analyse est illisible.');
    }
    return { delay: 0 };
  })();
  try {
    const out = await job;
    if (current && ACTIVE.has(current.state)) schedule(current.mid === mid ? out.delay : 0);
    return current;
  } finally { job = null; }
}
