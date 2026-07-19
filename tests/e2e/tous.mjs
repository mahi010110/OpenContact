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
  'e2e-compagnon-reponses.mjs', 'e2e-compagnon-scan.mjs', 'e2e-mcp.mjs']);
const compDir = path.resolve(DIR, '..', '..', 'compagnon');
const bin = path.join(compDir, 'target', 'debug', 'oc-compagnon');

/* Les scénarios natifs lancent target/debug/oc-compagnon. `cargo test` ne
   régénère PAS cet exécutable — on testerait sinon un binaire périmé (piège
   avéré : un correctif ou un nouveau handler absent du binaire fait échouer
   ou passer à tort). On le reconstruit donc ICI, avant les scénarios, dès que
   Cargo est là. Sans Cargo mais avec un binaire déjà présent, on l'utilise
   tel quel ; sans xvfb, on saute proprement. */
const hasXvfb = !spawnSync('xvfb-run', ['--help'], { stdio: 'ignore' }).error;
const hasCargo = !spawnSync('cargo', ['--version'], { stdio: 'ignore' }).error;
let nativeReason = '';
if (!hasXvfb){
  nativeReason = 'xvfb-run absent';
} else if (hasCargo){
  console.log('⚙  cargo build -p oc-compagnon (binaire natif à jour avant les scénarios)…');
  const b = spawnSync('cargo', ['build', '-p', 'oc-compagnon'], { cwd: compDir, stdio: 'inherit' });
  if (b.status !== 0) nativeReason = 'échec de la construction du binaire Compagnon';
} else if (!existsSync(bin)){
  nativeReason = 'binaire Compagnon absent (ni Cargo pour le construire)';
} else {
  console.log('⚠  Cargo absent : scénarios natifs joués contre le binaire EXISTANT (peut être ancien).');
}

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
