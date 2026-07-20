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
| `tests.js` | Auto-tests du moteur (`?test` dans l'URL, avec `tests-c8.js` et `tests-mcp.js`) |
| `tests/e2e/` | Scénarios de bout en bout (Playwright, `node tests/e2e/tous.mjs`) |
| `sw.js` | Service worker : hors-ligne + installation (PWA) |
| `manifest.webmanifest` | Manifeste d'installation |
| `icon.svg` | Icône de l'app |
| `compagnon/` | Le Compagnon (Tauri, **facultatif**) : campagnes app fermée, IMAP/SMTP, analyse d'e-mails, IA locale, serveur MCP local — voir `compagnon/README.md` |
| `docs/` | Briefs et feuilles de route (`plan-v7.md`, `docs/fable5/` pour le chantier connecté) |

## Installer le Compagnon (facultatif)

Le Compagnon est l'application d'appoint sur l'ordinateur : campagnes qui
partent même app fermée, détection des réponses, analyse d'e-mails, IA
locale. La PWA reste complète sans lui.

- **Depuis l'app** : Moi → Mes appareils → **Ajouter le Compagnon** — la
  feuille propose le bon fichier pour ton système et guide jusqu'à
  l'association (le code court s'affiche dans la fenêtre du Compagnon).
- **À la main** : la [dernière release](https://github.com/mahi010110/Open-Contact/releases/latest)
  porte des noms stables — `…linux-x64.deb` / `…linux-x64.AppImage`,
  `…windows-x64-setup.exe` (NSIS), `…macos-universel.dmg` (Intel + Apple
  Silicon). Construits et fumés par `.github/workflows/release.yml` :
  chaque paquet est installé/lancé et son canal local doit répondre avant
  publication.
- **Paquets NON SIGNÉS** : Windows préviendra (« Informations
  complémentaires » → « Exécuter quand même ») ; macOS bloquera le premier
  lancement (clic droit sur l'app → « Ouvrir »). La signature reste un
  geste du mainteneur.
- **La première association se fait sur l'ordinateur** (profil protégé et
  appareil principal requis). Ensuite, depuis le téléphone : dans une
  campagne, « Mon ordinateur envoie tout seul » — la sync privée fait le
  relais.

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
