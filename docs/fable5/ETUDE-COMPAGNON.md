# Étude — le cœur permanent du Compagnon : Rust ou Node.js ?

> **Statut : recommandation rendue, arbitrage mainteneur attendu.**
> Rien ici n'est une décision validée. Le développement du Compagnon ne
> commence pas avant l'arbitrage. Références : `SPECIFICATIONS.md` §8
> (rôle, association, points à vérifier), §9 (IA), §11 (MCP local),
> `engine/mission.js` (contrat de missions livré et testé côté PWA).

## 1. Ce que le cœur permanent doit faire

Le Compagnon (spec §8.1) est l'application locale facultative qui prend en
charge ce qu'un navigateur ne peut pas garantir :

1. **Vivre en permanence** : icône de zone de notification, démarrage avec la
   session, survie aux redémarrages, rattrapage après un arrêt brutal —
   **jamais un envoi double** (contrat `engine/mission.js`).
2. **Garder les secrets dans le trousseau OS** : mots de passe d'application,
   jetons OAuth (D8).
3. **Parler IMAP/SMTP** : Gmail par mot de passe d'application, Outlook par
   OAuth (XOAUTH2), SMTP générique ; détection des réponses par lecture des
   en-têtes récents.
4. **Parler à la PWA** : canal local + repli P2P **Trystero** (la lib JS déjà
   vendorisée), appairage par code court, missions idempotentes.
5. **Servir les runtimes IA** : Ollama (HTTP local), Codex App Server.
6. **Exposer un serveur MCP local** : lecture limitée, propositions seulement.
7. Une petite fenêtre de réglages (Tauri, déjà acté en spec).

## 2. Les options examinées

### A. Electron + Node — écartée d'emblée

Tout en JS, meilleures libs mail du marché (imapflow, nodemailer). Mais
~250 Mo installés, RAM lourde pour un processus qui tourne en permanence sur
le portable d'un étudiant, tapis roulant des mises à jour Chromium, et la
spec a déjà retenu Tauri. Contraire à l'éthique du projet (« dense, honnête,
net »).

### B. Tauri + sidecar Node (le cœur en Node, embarqué à côté)

- **Pour** : JS partout ; imapflow/nodemailer/mailparser excellents et très
  maintenus ; SDK MCP TypeScript officiel, le plus mûr.
- **Contre** : il faut **livrer un runtime Node** (~60-80 Mo) ou compiler en
  binaire unique — `pkg` est archivé (2024), Node SEA encore expérimental,
  `bun compile` produit ~90 Mo ; deux processus à superviser (crash du
  sidecar, orphelins, IPC) ; côté secrets, `keytar` est archivé (fin 2023)
  et les alternatives sérieuses (`@napi-rs/keyring`) sont… des bindings
  Rust ; les secrets vivent dans le tas V8, sans effacement mémoire, exposés
  à l'inspecteur. On se bat contre Tauri au lieu de s'en servir.

### C. Tauri tout-Rust (toute la logique en Rust)

- **Pour** : binaire unique ~12-20 Mo, RAM minimale, `keyring` + `zeroize`
  pour les secrets, `lettre` (SMTP, mûr), `mail-parser`/`mail-send`
  (Stalwart, excellents), `reqwest`, `rmcp` (SDK MCP Rust **officiel**,
  actif).
- **Contre — et c'est rédhibitoire** :
  1. Il faudrait **réécrire en Rust la logique la plus risquée du chantier**,
     déjà écrite et testée en JS : machine à états des campagnes, ids
     d'envoi stables, repli des rapports sur le journal, formats d'anneau et
     d'appairage. Deux implémentations du même contrat = divergence
     garantie, sur le code où un bug = un e-mail double à un vrai recruteur.
  2. **Trystero est une lib JS** : le repli P2P exigerait une
     réimplémentation Nostr + WebRTC en Rust — exactement le point que la
     spec (§8.3) demande de dérisquer, pas d'aggraver.
  3. Rust intégral = la barrière de maintenance la plus haute pour un
     mainteneur dont tout le projet est en JS vanilla.

### D. Hybride Tauri : coquille + adaptateurs en Rust, cerveau en JS partagé

L'architecture native de Tauri (front JS + commandes Rust), appliquée à un
processus de fond :

- **Côté Rust (mince, stable, écrit une fois)** — ce que seul un binaire
  natif peut faire :
  - vie du processus : zone de notification, démarrage auto, instance
    unique, mises à jour (plugins Tauri v2 officiels) ;
  - **trousseau OS** (`keyring`) : les secrets n'entrent **jamais** dans le
    JS — le cerveau dit « envoie avec le compte gmail-1 », Rust sort le
    secret du trousseau, s'authentifie, répond « fait » ;
  - sockets : IMAP (`async-imap`, utilisé en production par Delta Chat ;
    repli possible `imap-next`/Stalwart), SMTP (`lettre`), TLS (`rustls`),
    HTTP (`reqwest`) ;
  - serveur MCP (`rmcp`) : surface minuscule (outils de lecture +
    propositions), les outils appellent le cerveau ;
  - minuteries qui réveillent le cerveau.
- **Côté JS (fenêtre cachée = le cerveau)** — les décisions :
  - **les mêmes modules `engine/` que la PWA, à l'identique** :
    `mission.js`, `campaign.js` (journal idempotent), `mailer.js`
    (construction MIME), `crypto.js`/`exchange.js`/`ring.js` (appairage,
    même WebCrypto), et **Trystero vendorisé tel quel** pour le P2P ;
  - le cerveau ne touche jamais le réseau ni les secrets : il demande tout
    à Rust par `invoke` ; la CSP de la webview reste fermée.

## 3. Analyse par critère

| Critère | B. Sidecar Node | C. Tout-Rust | **D. Hybride** |
|---|---|---|---|
| Adéquation Tauri | à contre-courant (2 runtimes) | native | **native (c'est le modèle Tauri)** |
| Secrets | tas V8, keytar mort | trousseau + zeroize | **trousseau + zeroize, et le JS ne voit jamais un secret** |
| IMAP/SMTP | meilleures libs (imapflow) | libs correctes, surface étroite suffisante | libs Rust correctes ; besoin étroit (en-têtes, XOAUTH2) |
| P2P Trystero | réutilisable | **réécriture Nostr+WebRTC : risque majeur** | réutilisé tel quel |
| Logique risquée (campagnes, missions) | portage Node du code navigateur (proche mais dupliqué) | **réécriture Rust : deux vérités** | **le même fichier testé, zéro duplication** |
| MCP | SDK TS, le plus mûr | rmcp officiel, suffisant | rmcp officiel, suffisant |
| Livrable | binaire + runtime ~80 Mo, 2 processus | ~15 Mo, 1 processus | **~15 Mo, 1 processus (webview système)** |
| Maintenance | JS partout mais plomberie fragile | langue neuve sur TOUT le code | **langue neuve sur ~peu de code stable ; le vivant reste en JS** |
| RAM permanente | Node ~60-100 Mo | **~10-20 Mo (le meilleur)** | webview cachée ~60-120 Mo (honnête : le prix du réemploi) |

Le seul critère où D perd nettement est la RAM au repos, face à C. Issue de
secours documentée : `engine/` étant pur (aucun DOM), le cerveau pourra un
jour migrer vers un moteur JS embarqué (QuickJS/deno_core) sans webview —
même code, ~15 Mo. Ce n'est **pas** pour la V1 : la webview cachée est le
chemin simple qui garantit l'identité de comportement avec la PWA.

## 4. Recommandation

**Option D — hybride Tauri.** Rust n'est pas choisi « pour Rust » : il est
là où le système l'exige (trousseau, sockets, vie du processus), en
adaptateurs courts écrits une fois. Le cerveau — tout ce qui décide, tout ce
qui peut doubler un envoi — reste **l'unique implémentation JS déjà testée**,
partagée avec la PWA. C'est la seule option qui satisfait à la fois la
sécurité des secrets (meilleure que Node), le réemploi de Trystero et du
contrat de missions (impossible en tout-Rust), et une maintenance réaliste.

### Sous-décision associée : où vit le code ?

La spec dit « projet distinct » — distinct comme *application et build*,
pas forcément comme dépôt. **Recommandation : un dossier `compagnon/` dans
ce dépôt**, dont la webview importe directement `../engine/*.js` et
`../assets/vendor/trystero-nostr.min.js`. Zéro copie, zéro script de
synchronisation, les tests `?test` restent la vérité unique du contrat.
(L'alternative — dépôt séparé + subtree/submodule sur `engine/` — recrée le
risque de divergence que l'hybride vient d'éliminer.)

### Risques assumés et parades

| Risque | Parade |
|---|---|
| Courbe Rust pour le mainteneur | adaptateurs petits, délimités, quasi figés après écriture ; la logique produit n'y vit pas |
| Webview cachée qui doit rester vivante pour les envois planifiés | point de test n° 1 du squelette : tray sans fenêtre visible + minuterie Rust → réveil du cerveau, vérifié sur Windows (WebView2) d'abord |
| Maintenance d'`async-imap` | surface étroite (FETCH d'en-têtes, XOAUTH2) ; replis identifiés : `imap-next`, crates Stalwart |
| RAM de la webview | acceptée en V1 ; issue QuickJS documentée ci-dessus |
| Signature/SmartScreen des binaires | identique quel que soit le langage — traité au moment de la distribution (spec §8.3) |

## 5. Si l'arbitrage est rendu

1. Consigner D17 (cœur hybride) et D18 (dossier `compagnon/`) dans
   `CONTEXT.md`.
2. Débloquer P7-2 : squelette Tauri v2 (tray, autostart, instance unique,
   fenêtre cachée important `engine/`), premier test de bout en bout =
   une mission `campaign-run` rejouée après kill/redémarrage, zéro doublon.
3. Puis, dans l'ordre : trousseau + envoi SMTP/API, IMAP lecture (P7-3),
   MCP local `rmcp` (P8-2).
