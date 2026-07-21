/* ============================================================
   OpenContact — tests de bout en bout · outillage commun
   Résout Playwright et le Chromium pré-installé sans chemin en
   dur : OC_PLAYWRIGHT / OC_CHROMIUM priment, sinon les
   emplacements connus, sinon le navigateur par défaut de
   Playwright. Sert aussi le dépôt en HTTP statique local.
   Ces tests sont un outillage de développement : rien ici n'est
   chargé par l'application.
   ============================================================ */
import http from 'http';
import path from 'path';
import { readFile, mkdir } from 'fs/promises';
import { readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'captures');
await mkdir(SHOTS, { recursive: true });

async function loadPlaywright(){
  const cands = [process.env.OC_PLAYWRIGHT,
    '/opt/node22/lib/node_modules/playwright/index.mjs', 'playwright'].filter(Boolean);
  for (const c of cands){ try { return await import(c); } catch (e) {} }
  throw new Error('Playwright introuvable — `npm i -g playwright` ou OC_PLAYWRIGHT=<chemin de index.mjs>');
}
export const { chromium } = await loadPlaywright();

const isFile = p => { try { return statSync(p).isFile(); } catch (e) { return false; } };
export function chromiumPath(){
  if (process.env.OC_CHROMIUM) return process.env.OC_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (isFile(path.join(base, 'chromium'))) return path.join(base, 'chromium');
  try {
    for (const d of readdirSync(base)){
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (d.startsWith('chromium-') && isFile(p)) return p;
    }
  } catch (e) {}
  return undefined;               /* Playwright choisit alors son navigateur */
}

/* Attendre qu'une condition évaluée DANS la page devienne vraie.
   Piège avéré : `page.waitForFunction(async () => …)` ne déballe pas la
   promesse du prédicat — une promesse en attente est « truthy », l'attente
   « réussit » donc immédiatement sans rien vérifier. Ce helper évalue
   réellement (evaluate attend les fonctions async) et ré-essaie. */
export async function attendre(page, fn, { timeout = 15000, pas = 250, message = '' } = {}){
  const fin = Date.now() + timeout;
  for (;;){
    if (await page.evaluate(fn)) return;
    if (Date.now() > fin)
      throw new Error('attendre() : délai dépassé (' + timeout + ' ms)' + (message ? ' — ' + message : ''));
    await new Promise(r => setTimeout(r, pas));
  }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain' };
export async function serveRepo(){
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const data = await readFile(path.join(ROOT, p));   /* lire AVANT d'écrire l'entête */
      res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
