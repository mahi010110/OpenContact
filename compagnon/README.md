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

Le bundle (`deb`/`appimage`) passe par la CLI Tauri : `cargo tauri build`
depuis `compagnon/src-tauri` (la CLI lance `preparer.mjs` toute seule).

## Le canal local (résumé du protocole)

`GET /oc-compagnon` — découverte : `{v, nom, associe, appairage?:{s}}`.
Tout le reste voyage en enveloppes `OCV1.` (AES-GCM, AAD liée) :
`POST /appairage` sous la clé dérivée du code court (PBKDF2 120 000),
`POST /boite` sous la clé de canal née de l'appairage — messages
`ping`, `dissocier`, `mission` (bon signé Ed25519, re-vérifié à chaque
lecture), `revoquer`, `arreter-cible`, `rapport`, `analyse-etat`.
Rien d'utile en clair ; un processus local sans le code n'obtient rien.

## Crochets de développement (jamais en production)

`OC_APPAIRAGE_AUTO=code` (appairage ouvert au démarrage),
`OC_SMTP_TEST=hote:port` (puits SMTP en clair),
`OC_IMAP_TEST=hote:port` (faux IMAP en clair),
`OC_OLLAMA=url` / `OC_OLLAMA_MODELE`, `OC_CORPUS_TEST=fichier`,
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
