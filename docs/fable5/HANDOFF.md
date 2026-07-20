# Fable 5 — point de reprise (checkpoint)

- **Phase actuelle** : chantier connecté V1 **entièrement livré** — PWA
  (P0 → P8-2), Compagnon C1–C8, serveur MCP local, et **P6-3 : les trois
  familles IA de D5 complètes** (plus aucune famille « pas encore
  disponible »). Les corrections UX prioritaires de `AUDIT-UX.md` sont
  livrées et testées. Une CI GitHub Actions rejoue tout (V7).
- **V8 livrée — le Compagnon se télécharge depuis l'app** : la feuille
  « Ajouter le Compagnon » propose le bon installateur pour LE système de
  la personne (détection UA pure `engine/distribution.js`, liste RÉELLE
  des assets via `api.github.com/…/releases/latest`, CORS sans compte),
  dit l'honnêteté non-signé au moment du geste (SmartScreen, Gatekeeper,
  logithèque), puis enchaîne chercher → code → associer ; hors ligne ou
  release absente = repli court vers la page des téléchargements, jamais
  un lien mort déguisé. Sur téléphone, la même entrée explique que tout
  se passe sur l'ordinateur (chemin exact), copie le lien, et dit quoi
  faire ensuite depuis le téléphone. `release.yml` construit et publie la
  release aux noms STABLES (deb + AppImage, NSIS, dmg universel) et FUME
  chaque paquet avant publication (installé/lancé, `GET /oc-compagnon`
  doit répondre). Au passage, deux vraies failles corrigées : la CSP ne
  laissait passer NI `api.github.com` NI `openrouter.ai` — la famille
  OpenRouter livrée en P6-3 était donc morte en production (les routes de
  test s'appliquent APRÈS la CSP ; un E2E la verrouille désormais).
  Cache PWA **oc-v33**.
- **P6-3 livrée — l'IA passe aussi par ton ordinateur (D5 complet), sans
  modèle implicite** : OpenRouter rejoint Claude/Gemini en clé navigateur
  (CORS autorisé par le fournisseur, vérifié) ; Ollama (local, sans clé),
  OpenAI (clé de l'utilisateur) et l'abonnement ChatGPT passent par le
  Compagnon : messages `ia-demarrer`/`ia-etat`/`ia-annuler` du canal
  chiffré, asynchrones et ANNULABLES (fermer la feuille tue ou jette le
  travail, le verrou se libère, toute attente a une échéance), garde pure
  `oc_coeur::ia` (vocabulaire fermé, bornes d'entrée et de sortie
  `TEXTE_MAX`). **Aucun modèle codé en dur nulle part** — la leçon
  Gemini 2.0 Flash (éteint le 2026-06-01 alors que le code le servait
  par défaut) est corrigée à la racine : l'utilisateur choisit dans la
  liste que chaque fournisseur sert VRAIMENT (`/v1/models` Anthropic et
  OpenAI, `ListModels` Gemini, `/api/v1/models` OpenRouter, tags Ollama,
  et `codex app-server` → `model/list` pour l'abonnement — GPT-5.5/5.6 et
  variantes selon le compte), liste injoignable = dit honnêtement, champ
  libre en repli. Génération ChatGPT par `codex exec` non interactif :
  prompt par STDIN (jamais dans `ps`), bac à sable lecture seule (ni
  écriture, ni commande, ni réseau), cadrage donnée≠instruction,
  `--model` choisi. La clé sert l'appel puis s'oublie : jamais écrite
  chez le Compagnon (prouvé par `grep` du disque dans l'E2E), jamais
  journalisée. Erreurs en codes courts (`cle`, `quota`, `indispo`,
  `runtime`, `occupe`, `eteint`, `compagnon`, `modele`, `annule`)
  traduits par le composeur — le texte en place n'est jamais perdu.
  Cache PWA **oc-v32**. Crochets dev : OC_OPENAI_TEST, OC_CODEX.
- **P8-2 livrée — serveur MCP local** : `oc-compagnon --mcp` (SDK officiel
  `rmcp`, transport **stdio** : le client IA compatible lance le processus,
  aucun port). Coupé par défaut ; autorisé et révoqué depuis la feuille du
  Compagnon (Mes appareils), l'état est relu à CHAQUE appel. Deux outils :
  `resume_pistes` (résumé en liste blanche construit par `engine/mcp.js`,
  poussé par la PWA, re-filtré par `oc_coeur::mcp` — nom, ville, domaine,
  postes, dernière activité, suivi agrégé, jamais une note ni un contact)
  et `proposer_pistes` (schéma fermé + bornes, enveloppe `share` scellée
  en attente, `pid` = hash du contenu → rejeu idempotent). La PWA rapporte
  les propositions (`ui/propositions.js`), les garde scellées sous
  `oc_proposals_v1` (SEALABLE, wipe, CONTRAT §1), chip d'Aujourd'hui →
  aperçu multi-sélection existant → fusion + Annuler, ou « Écarter » +
  retour. Les fichiers d'échange `mcp-*.ocv` sont scellés sous une clé
  fichier 0600 dédiée (les trousseaux de session ne se partagent pas
  entre processus indépendants). Journal sobre `mcp-journal.log`. Cache
  PWA **oc-v31**.
- **Phase V (durcissement) livrée** : rotation du coffre interruptible et
  reprenable (`prev` dans `oc_vault_v1`), le SW ne détourne plus
  `oauth.html` (oc-v23), `wipe` complet (jetons, clés IA, campagnes,
  missions, documents), plafond 15/j **global** + fenêtre d'envoi
  lun–ven 8-19 h (`dueSendsAll`, `inSendWindow`), tests Playwright
  versionnés dans `tests/e2e/` (`node tests/e2e/tous.mjs`),
  et reconnexion IndexedDB automatique (les navigateurs mobiles ferment
  la connexion sous pression mémoire — l'app rouvre et re-tente).
- **Branche Git** : `claude/opencontact-repo-study-3bw0ju`
- **Livré, dans l'ordre** :
  1. **P0 — coffre** : `engine/vault.js` (clé maîtresse, wraps
     code/phrase/PRF, `OCV1.`, 256 mots), couche scellante de
     `engine/storage.js` (SEALABLE, verrou jamais silencieux).
  2. **P1 — verrou** : `ui/verrou.js` (écran verrouillé, création guidée
     avec sauvegarde bloquante D15, auto-lock 5/15 min, `requireCode`),
     bloc sécurité dans Moi (D14, D16).
  3. **P2 — appareil principal** : `engine/ring.js` (anneau Ed25519 signé,
     générations, récupération par clé de secours dérivée de la phrase),
     commandes dans `synclive.js`/`direct.js`, récupération D7 complète.
  4. **P3-1 — moteur campagnes** : `engine/campaign.js` (Fixe, 15/j
     glissant, J+7 réels, opposition imposée, ids stables anti-doublon).
  5. **P4 — envoi direct** : `engine/mailer.js` + `oauth.html` +
     `ui/connexions.js` + feuille Écrire connectée (brouillon jamais
     perdu, mailto repli).
  6. **P5 — campagnes UX** : bifurcation Prospecter, assistant, ligne
     quotidienne d'Aujourd'hui, feuille du jour (D13), réconciliation
     des réponses, tags.
  7. **P6 — IA** : `engine/assist.js` (priorisation retards, signature→
     contact), `engine/ai.js` (3 familles D5), groupe IA de Connexions,
     brouillon relu dans le composeur.
  8. **P7-1/P8-1** : `engine/mission.js` (missions bornées/révocables/
     idempotentes) ; « Depuis mes e-mails » dans Recevoir (V1 guidée par
     prompt + chemin Compagnon), suivi/résultat scellé dans
     `oc_analysis_v1`, reprise après fermeture dans Aujourd'hui, aperçu
     multi-sélection et injection neutralisée par le rail.
- **Tests de référence après P6-3** : `?test` est vert à **87/87**. La
  suite complète (`node tests/e2e/tous.mjs`) passe à **16/16, zéro saut**.
  `cargo test --locked` passe à **31/31** (30 cœur dont 5 MCP et 5 IA +
  1 coquille), le Compagnon se construit, puis les **6/6 scénarios natifs
  passent contre le vrai binaire** : envoi + kill/reprise sans doublon,
  réponse IMAP, analyse locale fermée/reprise + fusion sûre, téléphone C8,
  MCP local (client JSON-RPC réel sur stdio) et rédaction IA via
  l'ordinateur (listes de modèles réelles des trois runtimes factices,
  protocole app-server exact, prompt par stdin, clé jamais sur le disque,
  annulation qui libère — rejoué trois fois). Le cache PWA est
  **oc-v32**. La CI (`.github/workflows/ci.yml`) rejoue unitaires, cargo
  et la suite complète ; `paquets.yml` construit les bundles non signés
  par OS — `.deb`, installateur NSIS, `.app`+`.dmg` (icônes `.ico`/`.icns`
  versionnées) — joué sur toute PR qui le modifie, et à la demande.
- **Blocages externes (dans l'ordre d'importance)** :
  1. **Apps OAuth Google/Microsoft à déclarer par le mainteneur** —
     renseigner les IDs publics dans `MAIL_CLIENTS` (`engine/mailer.js`),
     puis essai réel d'envoi (l'option avancée de Connexions permet de
     tester avec son propre client avant).
  2. **Validation matérielle** : la validation native automatisée est faite ;
     restent le `.deb`, le trousseau, le démarrage automatique, la zone de
     notification, le verrou PRF, l'anneau, un vrai client MCP de bureau et
     les runtimes IA réels (Ollama installé, Codex connecté) sur de vrais
     appareils.
  3. **Distribution** : `release.yml` publie la release téléchargeable
     (noms stables, paquets fumés) et la feuille « Ajouter le Compagnon »
     la sert dans l'app ; restent la **signature**, la **publication du
     dépôt** (un dépôt privé n'offre pas de téléchargement anonyme — la
     feuille le dit et renvoie vers la page des releases) et Outlook
     OAuth — gestes du mainteneur.
- **Compagnon (D17/D18 validés — C1 à C8 terminés, `compagnon/`)** :
  - **C1 livré** : crate `oc-coeur` (la garde D17 — mission signée
    Ed25519, anti-double-envoi, plafond global, fenêtre, hors-mission)
    `cargo test` 9/9 dont **vecteur croisé** avec le test JS « fil
    signé » (`signMission`/`openMissionWire` dans `engine/mission.js`) ;
    coquille Tauri v2 (tray non fatal, arrière-plan sur fermeture,
    instance unique, démarrage auto par commandes, fenêtre de réglages ; en
    mode intégration la commande vérifie désormais que le composant autostart
    existe avant de l'appeler, donc aucun plantage au build propre)
    qui **compile et démarre** (xvfb : « compagnon : prêt ») ; cerveau
    webview qui charge le **moteur partagé copié par `preparer.mjs`**
    (vérifié : « moteur partagé chargé ✓ »).
  - **C2 livré** : canal local 127.0.0.1 (tout en enveloppes `OCV1.`,
    jamais de clair), appairage par code court (PBKDF2 partagé JS/Rust,
    5 essais, 2 min), secrets au trousseau OS (repli fichier 0600),
    « Ajouter le Compagnon » dans Mes appareils (associer, présence
    prêt/éteint, rompre — anneau nettoyé, Compagnon prévenu), clé
    `oc_companion_v1` scellée. E2E contre un faux Compagnon au
    protocole exact + canal du vrai binaire interrogé sous xvfb.
    Au passage : **le SW ne touche plus aux requêtes hors origine**
    (il mettait en cache les réponses d'API — sel d'appairage périmé).
  - **C3+C4 livrés — le Compagnon envoie, app fermée, pour de vrai** :
    bon de mission signé confié sur le canal (re-vérifié à chaque
    lecture), **planificateur Rust** (`coeur/planifier.rs`, miroir du
    moteur JS sous fixtures croisées — décision prise après preuve que
    la webview ne tourne pas en headless), journal scellé écrit AVANT
    l'envoi (incertain→fait, refus=erreur, transitoire re-tentable),
    SMTP lettre/rustls (réglage scellé, mot de passe d'application au
    trousseau — fenêtre Messagerie du Compagnon), plafond global et
    fenêtre re-vérifiés par la garde à chaque envoi. PWA : « Qui
    appuie sur Envoyer ? » au contrôle (D13 : toi par défaut), ligne
    « ton ordinateur s'en occupe », feuille confiée avec état honnête
    et « Reprendre la main » (révocation, mise en file si éteint),
    rapport replié idempotent. E2E contre le VRAI binaire : envois
    SMTP réels, kill −9 + relance = zéro doublon. Le `journal_lock` sérialise
    aussi le premier passage lancé par le canal et la boucle périodique : la
    course qui produisait occasionnellement deux e-mails est fermée (8/8
    répétitions sous charge vertes).
    Crochets de développement (jamais en prod) : OC_APPAIRAGE_AUTO,
    OC_SMTP_TEST, OC_TICK_MS, OC_FENETRE_TEST, OC_INTEGRATION_TEST.
  - **C5 livré — les réponses arrêtent les relances toutes seules** :
    lecture IMAP en-têtes seulement (`FROM … SINCE …`), même mot de
    passe d'application (D8), toutes les 10 min ; la cible s'arrête
    côté Compagnon (non débrayable) et la PWA replie : fiche
    « réponse », trace, relances annulées. E2E vrai binaire + faux
    IMAP (OC_IMAP_TEST). Outlook OAuth : attend l'app du mainteneur.
  - **C6 livré — « ton ordinateur lit tes e-mails »** : mission
    `mail-scan` bornée (jours, 40 messages, 100 Ko), Ollama local
    (OC_OLLAMA), résultat scellé, annulable (révoquée = rien n'est
    produit) ; la PWA offre le chemin auto dans « Depuis mes e-mails »
    (Compagnon associé). La PWA écrit le `mid` avant l'appel réseau, garde
    l'état et le résultat sous coffre (`oc_analysis_v1`), reprend le sondage
    après déverrouillage et affiche le résultat dans Aujourd'hui. L'aperçu
    peut être fermé sans consommer le résultat ; seule la fusion l'efface.
    E2E vrai binaire : fermeture pendant Ollama, reprise, corpus piégé et
    injection neutralisée par le rail.
  - **C7 livré** : états partout (éteint/rattrapage, refus/incertain/
    transitoire, révocations en file), docs, oc-v27 à la livraison C7
    (oc-v28 après corrections UX). **Installable
    prouvé** : `cargo tauri build --bundles deb` (CLI 2.11) produit
    `OpenContact Compagnon_0.1.0_amd64.deb` (6,1 Mo, release) —
    installé et vérifié dans le conteneur (`/usr/bin/oc-compagnon`).
    Windows (installateur NSIS) et macOS (`.app`+`.dmg`) sortent
    désormais non signés de `paquets.yml` ; restent l'AppImage local et
    la signature (spec §8.3, geste mainteneur).
  - **C8 livré — confier depuis le téléphone** : l'option auto apparaît sans
    association locale dès que l'anneau connaît un appareil `companion`, avec
    l'état honnête « ton ordinateur la prendra dès qu'il te rejoint ».
    Campagnes et `oc_missions_v1` voyagent dans la sync privée ; le fil
    `{m,sig,dev}` reste intact, `mid` et états convergent sans régression.
    L'ordinateur associé actualise l'anneau signé du Compagnon, puis remet la
    mission une seule fois. Le cœur Rust résout et re-vérifie la clé de
    l'appareil émetteur dans cet anneau. `oc_companion_v1` ne quitte jamais
    l'ordinateur. E2E vrai binaire : téléphone 390×844, ordinateur 1280×800,
    clair/sombre, trois rejeux de sync puis plusieurs cycles = un seul SMTP ;
    scénario rejoué trois fois sans flakiness.
- **Ordre de suite recommandé** : tester le `.deb`, le verrou PRF, l'anneau
  et les parcours Compagnon (dont un vrai client MCP type Claude Desktop,
  Ollama installé et Codex connecté) sur matériel réel ; déclarer et essayer
  les apps OAuth Google/Microsoft ; lancer `paquets.yml` puis signer et
  publier. **Le code du chantier V1 est complet** — P6-3 en était la
  dernière brique. Les ajustements visuels écran par écran restent un
  chantier séparé avec le mainteneur.
- **Première vérification à la prochaine reprise** :
  `git log --oneline -8 && git status`, puis
  `node tests/e2e/unitaires.mjs` (**87/87 attendus**) et
  `node tests/e2e/tous.mjs` (**16/16, zéro saut**). Pour le natif :
  `cargo test --locked --manifest-path compagnon/Cargo.toml` (**30/30**),
  `cargo build --locked --manifest-path compagnon/Cargo.toml -p oc-compagnon`,
  puis les six scénarios natifs, dont `e2e-mcp.mjs` et
  `e2e-compagnon-ia.mjs`. La CI GitHub rejoue tout à chaque poussée.
