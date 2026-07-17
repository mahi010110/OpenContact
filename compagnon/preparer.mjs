/* Prépare compagnon/app avant un build ou un dev Tauri : copie le
   moteur, le vendor P2P et les tokens depuis la racine du dépôt vers
   app/moteur/ (non versionné). La source de vérité reste UNIQUE —
   le cerveau du Compagnon exécute les mêmes fichiers `engine/` que
   la PWA, jamais une réécriture (D17/D18). */
import { cp, mkdir, rm } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, '..');
const dest = path.join(ici, 'app', 'moteur');

await rm(dest, { recursive: true, force: true });
await mkdir(path.join(dest, 'assets', 'vendor'), { recursive: true });
await cp(path.join(racine, 'engine'), path.join(dest, 'engine'), { recursive: true });
await cp(path.join(racine, 'assets', 'vendor', 'trystero-nostr.min.js'),
         path.join(dest, 'assets', 'vendor', 'trystero-nostr.min.js'));
await cp(path.join(racine, 'assets', 'fonts'), path.join(dest, 'assets', 'fonts'), { recursive: true });
await cp(path.join(racine, 'styles', 'tokens'), path.join(dest, 'styles', 'tokens'), { recursive: true });
console.log('moteur partagé copié →', dest);
