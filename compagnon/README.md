# OpenContact Compagnon

L'application d'appoint sur l'ordinateur (D17/D18, `docs/fable5/ETUDE-COMPAGNON.md`) :
elle prend ce qu'un navigateur ne peut pas garantir — envois de campagne
app fermée, secrets dans le trousseau du système, IMAP/SMTP, analyse
d'e-mails — et **rien d'autre**. La PWA reste complète sans elle.

## Architecture (hybride Tauri)

- **`coeur/`** — crate Rust pure : la **garde des règles critiques**.
  Quoi que décide le cerveau, rien ne part sans qu'elle re-vérifie :
  mission signée (Ed25519) et vivante, anti-double-envoi (journal
  idempotent), plafond global 15/jour, fenêtre lun–ven 8 h–19 h,
  appartenance à la mission. `cargo test -p oc-coeur` — dont un
  **vecteur croisé** signé par le moteur JS (`tests.js`, « fil signé »).
- **`src-tauri/`** — la coquille : vie du processus (barre système,
  instance unique, démarrage auto optionnel, fenêtre de réglages),
  et les capacités natives exposées au cerveau par commandes.
- **`app/`** — le cerveau (webview) : il exécute les **mêmes modules
  `engine/`** que la PWA, copiés par `preparer.mjs` dans `app/moteur/`
  (non versionné — source unique). Le JS ne touche jamais ni le réseau
  ni un secret : il demande tout à la coquille.

## Construire

```
node compagnon/preparer.mjs        # copie engine/ + tokens dans app/moteur/
cargo test -p oc-coeur             # la garde (18 tests, vecteurs croisés)
cargo build -p oc-compagnon        # la coquille (webkit2gtk + gtk3 requis sous Linux)
```

Le bundle passe par la CLI Tauri depuis `compagnon/src-tauri` (elle lance
`preparer.mjs` toute seule) : `cargo tauri build` fait `deb`/`appimage`
sous Linux ; Windows demande `--bundles nsis`, macOS `--bundles app,dmg`
(icônes `.ico`/`.icns` versionnées dans `icons/`). `paquets.yml` joue les
trois, non signés, sur toute PR qui le modifie et à la demande.
`release.yml` publie la **GitHub Release téléchargeable** : mêmes bundles
sous des noms STABLES (ceux que la feuille « Ajouter le Compagnon » de la
PWA sait choisir — `engine/distribution.js`), chaque paquet installé/lancé
et sondé (`GET /oc-compagnon`) avant publication.

## Le canal local (résumé du protocole)

`GET /oc-compagnon` — découverte **anonyme** (répond à toute origine) :
`{v, appairage?:{s}}` — ni le nom de la machine ni l'état d'association n'y
figurent, ils voyagent sur le canal authentifié.
Tout le reste voyage en enveloppes `OCV1.` (AES-GCM, AAD liée) :
`POST /appairage` sous la clé dérivée du code court (PBKDF2 120 000),
`POST /boite` sous la clé de canal née de l'appairage — messages
`ping`, `dissocier`, `mission` (bon signé Ed25519, re-vérifié à chaque
lecture), `revoquer`, `arreter-cible`, `rapport`, `analyse-etat`,
`ia-demarrer`/`ia-etat`/`ia-annuler` (rédaction D5 : Ollama local,
OpenAI par la clé de l'utilisateur — elle sert l'appel puis s'oublie,
jamais écrite ici — ou l'abonnement ChatGPT via l'outil officiel Codex ;
`op:"modeles"` rend la liste que le runtime sert VRAIMENT — tags
Ollama, `/v1/models`, `codex app-server` → `model/list` — c'est dedans
que l'utilisateur choisit, jamais un modèle codé en dur ; la génération
Codex passe par `codex exec` non interactif : prompt par STDIN, bac à
sable lecture seule, `--model` choisi ; sorties bornées `TEXTE_MAX`,
annulation qui tue ou jette le travail), `mcp-regler`, `resume`,
`propositions`, `proposition-reglee`.
Rien d'utile en clair ; un processus local sans le code n'obtient rien.

## Le serveur MCP local (P8-2)

`oc-compagnon --mcp` sert le protocole MCP sur **stdio** (SDK officiel
`rmcp`) : c'est le client IA compatible qui lance le processus — aucun
port, aucun relais, aucun compte. **Coupé par défaut** ; l'autorisation
se donne et se révoque dans OpenContact (Mes appareils → feuille du
Compagnon), relue à CHAQUE appel. Deux outils, pas un de plus :
`resume_pistes` (lecture bornée d'un résumé en liste blanche — nom,
ville, domaine, postes, dernière activité, suivi agrégé — poussé par la
PWA et re-filtré par `oc_coeur::mcp`) et `proposer_pistes` (schéma
fermé, bornes strictes ; la proposition devient une enveloppe `share`
scellée en attente, rejouable sans doublon par son `pid`, et repasse
par l'aperçu multi-sélection de la PWA — jamais une écriture directe,
aucune suppression exposée). Les fichiers d'échange (`mcp-*.ocv`) sont
scellés sous une clé fichier 0600 dédiée — deux processus indépendants
doivent les ouvrir et les trousseaux de session ne se partagent pas
entre un bureau et un client tiers. Journal sobre : `mcp-journal.log`
(gestes et comptes, jamais un contenu).

## Crochets de développement (jamais en production)

`OC_APPAIRAGE_AUTO=code` (appairage ouvert au démarrage),
`OC_SMTP_TEST=hote:port` (puits SMTP en clair),
`OC_IMAP_TEST=hote:port` (faux IMAP en clair),
`OC_OLLAMA=url` / `OC_OLLAMA_MODELE`, `OC_CORPUS_TEST=fichier`,
`OC_OPENAI_TEST=url` (faux service OpenAI pour la rédaction D5),
`OC_CODEX=chemin` (outil Codex de remplacement),
`OC_TICK_MS`, `OC_FENETRE_TEST=1`, `OC_INTEGRATION_TEST=1`. Ce dernier
désactive uniquement l'instance unique, le démarrage automatique et la zone
de notification lorsque D-Bus ou `/proc` manquent ; le moteur, le canal, la
webview et les adaptateurs restent ceux du binaire réel. Les scénarios
`tests/e2e/e2e-compagnon-*.mjs` utilisent ces crochets sous xvfb.

## Règles héritées du dépôt

Pas de serveur, pas de compte, pas d'analytics. Les secrets vivent dans
le trousseau OS, jamais dans un fichier ni un log. Une mission est
idempotente, bornée, révocable — deux canaux ou un redémarrage ne font
jamais le travail deux fois (`CONTRAT.md`, `engine/mission.js`).
