# OpenContact

Outil communautaire et **local-first** pour trouver, enrichir et partager des pistes
et contacts utiles (stage, alternance, emploi). Sans compte, sans serveur : les
données vivent dans le navigateur et circulent par fichiers `.oc` échangés.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Toute l'application (HTML + CSS + JS, un seul fichier) |
| `sw.js` | Service worker : hors-ligne + installation (PWA) |
| `manifest.webmanifest` | Manifeste d'installation |
| `icon.svg` | Icône de l'app |

## Développement

Servir le dossier en local (`python3 -m http.server`) puis ouvrir `index.html`.
Auto-tests intégrés : ajouter `?test` à l'URL (résultats en console et en toast).
