# OpenContact

Outil communautaire et **local-first** pour trouver, enrichir et partager des pistes
et contacts utiles (stage, alternance, emploi). Sans compte, sans serveur : les
données vivent dans le navigateur et circulent par fichiers `.oc` échangés.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de l'interface (HTML) |
| `styles/` | Feuille de production `app.css` + `tokens/` (couleurs, typos, effets — source unique du design) |
| `app.js` | Couche interface : état de l'application, rendus, carte, écouteurs |
| `engine/` | Le moteur : modèle de données, stockage, chiffrement, fusion, score, filtres, géocodage — aucun accès à l'écran |
| `assets/` | Polices (WOFF2 + licences OFL), 73 icônes pixel (pixelarticons, MIT), logos |
| `design/` | Le kit de design « Utilitaire 98 » : composants de référence, guidelines, maquettes |
| `tests.js` | Auto-tests du moteur (`?test` dans l'URL) |
| `sw.js` | Service worker : hors-ligne + installation (PWA) |
| `manifest.webmanifest` | Manifeste d'installation |
| `icon.svg` | Icône de l'app |

Règle de sens unique : l'interface (`app.js`) appelle le moteur (`engine/`),
jamais l'inverse — le moteur reçoit des paramètres et rend des valeurs, sans
jamais lire ni toucher l'écran.

Le contrat de données — clés de stockage, format `.oc`, schéma d'une piste,
invariants de fusion — est figé noir sur blanc dans [`CONTRAT.md`](CONTRAT.md)
et vérifié par les auto-tests (`?test`).

## Développement

Servir le dossier en local (`python3 -m http.server`) puis ouvrir
`http://localhost:8000`. L'app est découpée en modules ES : l'ouverture
directe du fichier (`file://`) ne fonctionne pas, il faut ce petit serveur.
Auto-tests intégrés : ajouter `?test` à l'URL (résultats en console et en toast).
