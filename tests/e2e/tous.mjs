/* Lance la suite complète : auto-tests unitaires (?test) puis chaque
   scénario de bout en bout, en série. Sortie non nulle si un seul
   rougit. Usage : node tests/e2e/tous.mjs */
import { spawn, spawnSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const scripts = ['unitaires.mjs',
  ...readdirSync(DIR).filter(f => f.startsWith('e2e-') && f.endsWith('.mjs')).sort()];
const natifs = new Set(['e2e-c8-telephone.mjs', 'e2e-compagnon-envoi.mjs',
  'e2e-compagnon-reponses.mjs', 'e2e-compagnon-scan.mjs']);
const bin = path.resolve(DIR, '..', '..', 'compagnon', 'target', 'debug', 'oc-compagnon');
const nativeReason = !existsSync(bin) ? 'binaire Compagnon absent'
  : (spawnSync('xvfb-run', ['--help'], { stdio: 'ignore' }).error ? 'xvfb-run absent' : '');

let ko = 0, joues = 0, sautes = 0;
for (const s of scripts){
  console.log('\n━━━ ' + s + ' ━━━');
  if (natifs.has(s) && nativeReason){
    sautes++;
    console.log('↷ sauté — ' + nativeReason + ' (construire avec Cargo puis relancer)');
    continue;
  }
  joues++;
  const code = await new Promise(res =>
    spawn(process.execPath, [path.join(DIR, s)], { stdio: 'inherit' }).on('close', res));
  if (code) ko++;
  console.log((code ? '✗ ' : '✓ ') + s);
}
console.log('\n' + `${joues - ko}/${joues} joués avec succès · ${sautes} sauté(s) · ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
