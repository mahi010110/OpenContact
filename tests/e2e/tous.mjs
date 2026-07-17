/* Lance la suite complète : auto-tests unitaires (?test) puis chaque
   scénario de bout en bout, en série. Sortie non nulle si un seul
   rougit. Usage : node tests/e2e/tous.mjs */
import { spawn } from 'child_process';
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const scripts = ['unitaires.mjs',
  ...readdirSync(DIR).filter(f => f.startsWith('e2e-') && f.endsWith('.mjs')).sort()];

let ko = 0;
for (const s of scripts){
  console.log('\n━━━ ' + s + ' ━━━');
  const code = await new Promise(res =>
    spawn(process.execPath, [path.join(DIR, s)], { stdio: 'inherit' }).on('close', res));
  if (code) ko++;
  console.log((code ? '✗ ' : '✓ ') + s);
}
console.log('\n' + (ko ? `${ko} scénario(s) en échec sur ${scripts.length}` : `${scripts.length}/${scripts.length} scénarios verts`));
process.exit(ko ? 1 : 0);
