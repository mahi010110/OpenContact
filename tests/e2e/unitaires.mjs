/* Lance ?test dans Chromium headless et rapporte window.__ocTests. */
import { chromium, chromiumPath, ROOT, SHOTS } from './outils.mjs';
import http from 'http';
import { readFile, stat } from 'fs/promises';
import path from 'path';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain' };

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    const st = await stat(f);
    if (st.isDirectory()) { res.writeHead(403); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(await readFile(f));
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/?test`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ocTests, null, { timeout: 30000 });
const R = await page.evaluate(() => window.__ocTests);
const fails = R.filter(r => r['résultat'] !== '✓');
console.log(`Tests : ${R.length - fails.length}/${R.length} verts`);
for (const f of fails) console.log('ROUGE :', f.test, '—', f['résultat']);
if (consoleErrors.length) { console.log('Erreurs console :'); consoleErrors.forEach(e => console.log(' ', e.slice(0, 300))); }
await browser.close();
server.close();
process.exit(fails.length || consoleErrors.length ? 1 : 0);
