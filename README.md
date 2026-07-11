# OpenContact

Outil communautaire et **local-first** pour trouver, enrichir et partager des pistes
et contacts utiles (stage, alternance, emploi). Sans compte, sans serveur : les
données vivent sur les appareils et circulent **en direct de pair à pair**
(WebRTC — sync de ses propres appareils, partage en groupe) ou par fichiers `.oc`
(le repli qui marche toujours : hors-ligne, réseau bloqué, main à la main).

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de l'interface (HTML) |
| `styles/` | Feuille de production `app.css` + `tokens/` (couleurs, typos, effets — source unique du design) |
| `app.js` | Amorçage et routeur ; chaque écran vit dans `ui/` |
| `ui/` | Les écrans et le direct P2P (`direct.js` : mes appareils + partage en groupe) |
| `engine/` | Le moteur : modèle, stockage (IndexedDB), chiffrement, fusions (communautaire `merge.js`, appareils `sync.js`), score, filtres — aucun accès à l'écran |
| `assets/` | Polices (WOFF2 + licences OFL), icônes pixel (pixelarticons, MIT), logos, libs vendorisées (jsQR, qrcode-generator, Trystero — MIT) |
| `design/` | Le kit de design « Utilitaire 98 » : composants de référence, guidelines, maquettes |
| `tests.js` | Auto-tests du moteur (`?test` dans l'URL) |
| `sw.js` | Service worker : hors-ligne + installation (PWA) |
| `manifest.webmanifest` | Manifeste d'installation |
| `icon.svg` | Icône de l'app |
| `docs/` | Briefs et feuille de route (`plan-v7.md`) |

## Le direct (P2P)

- **Mes appareils** : une phrase de liaison, et téléphone + ordinateur se
  synchronisent en entier (suivi privé compris) — le plus récent gagne,
  les suppressions voyagent (tombstones). `engine/sync.js` + `ui/direct.js`.
- **Partage en groupe** : un mot de passe de groupe, et les fiches partageables
  circulent en direct — jamais le privé, aperçu avant chaque fusion.
- Transport : WebRTC via [Trystero](https://github.com/dmotz/trystero)
  (vendorisé, 58 Ko) ; la signalisation passe par des relais Nostr publics,
  les données vont de pair à pair, chiffrées. Relais personnalisables via la
  clé `oc_relays_v1` (utile si un établissement bloque les relais publics).

Règle de sens unique : l'interface (`app.js`) appelle le moteur (`engine/`),
jamais l'inverse — le moteur reçoit des paramètres et rend des valeurs, sans
jamais lire ni toucher l'écran.

Le contrat de données — clés de stockage, format `.oc`, schéma d'une piste,
invariants de fusion — est figé noir sur blanc dans [`CONTRAT.md`](CONTRAT.md)
et vérifié par les auto-tests (`?test`).

## Développement

**Avant toute contribution — humaine ou assistée par IA — lire
[`CLAUDE.md`](CLAUDE.md)** : c'est la référence produit & UI/UX qui
centralise la direction, les invariants, le design « Utilitaire 98 »,
l'approche adaptative et le catalogue des motifs d'interaction. Aucune
décision UI/UX ne se prend en dehors de ce cadre.

Servir le dossier en local (`python3 -m http.server`) puis ouvrir
`http://localhost:8000`. L'app est découpée en modules ES : l'ouverture
directe du fichier (`file://`) ne fonctionne pas, il faut ce petit serveur.
Auto-tests intégrés : ajouter `?test` à l'URL (résultats en console et en toast).
