# Fable 5 — point de reprise (checkpoint)

- **Phase actuelle** : chantier connecté V1 livré côté PWA (P0 → P8-1) et
  **Compagnon C1–C7 livré** dans `compagnon/`. Les corrections UX prioritaires
  de `AUDIT-UX.md` sont maintenant livrées et testées. C8, MCP, nouvelles IA
  et installateurs Windows/macOS restent volontairement hors périmètre.
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
     prompt, aperçu multi-sélection, injection neutralisée par le rail).
- **Tests de référence après correction UX et reprise native** : `?test` est
  vert à **79/79**. Les 10 scénarios navigateur passent. Rust/Cargo 1.97.1 a
  été installé localement : `cargo test --locked` passe à **19/19** (18 cœur
  + 1 coquille), le Compagnon se construit, puis les **3/3 scénarios natifs
  passent contre le vrai binaire** : envoi + kill/reprise sans doublon,
  réponse IMAP, analyse locale + fusion sûre. Le cache PWA est **oc-v28**.
- **Blocages externes (dans l'ordre d'importance)** :
  1. **Apps OAuth Google/Microsoft à déclarer par le mainteneur** —
     renseigner les IDs publics dans `MAIL_CLIENTS` (`engine/mailer.js`),
     puis essai réel d'envoi (l'option avancée de Connexions permet de
     tester avec son propre client avant).
  2. **Validation matérielle** : la validation native automatisée est faite ;
     restent le `.deb`, le trousseau, le démarrage automatique, la zone de
     notification, le verrou PRF et l'anneau sur de vrais appareils.
  3. **Distribution** : Outlook OAuth, signatures, AppImage réel,
     installateurs Windows/macOS et publication restent externes ou à faire.
- **Compagnon (D17/D18 validés — C1 à C7 terminés, `compagnon/`)** :
  - **C1 livré** : crate `oc-coeur` (la garde D17 — mission signée
    Ed25519, anti-double-envoi, plafond global, fenêtre, hors-mission)
    `cargo test` 9/9 dont **vecteur croisé** avec le test JS « fil
    signé » (`signMission`/`openMissionWire` dans `engine/mission.js`) ;
    coquille Tauri v2 (tray non fatal, arrière-plan sur fermeture,
    instance unique, démarrage auto par commandes, fenêtre de réglages)
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
    SMTP réels, kill −9 + relance = zéro doublon.
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
    (Compagnon associé) et le résultat repasse par l'aperçu
    multi-sélection — E2E vrai binaire, corpus piégé, injection
    neutralisée par le rail.
  - **C7 livré** : états partout (éteint/rattrapage, refus/incertain/
    transitoire, révocations en file), docs, oc-v27 à la livraison C7
    (oc-v28 après corrections UX). **Installable
    prouvé** : `cargo tauri build --bundles deb` (CLI 2.11) produit
    `OpenContact Compagnon_0.1.0_amd64.deb` (6,1 Mo, release) —
    installé et vérifié dans le conteneur (`/usr/bin/oc-compagnon`).
    AppImage/Windows/macOS : à produire sur les OS cibles (signature
    comprise — spec §8.3, geste mainteneur).
  - **C8 à faire (hors reprise UX)** : missions depuis le téléphone —
    sync des campagnes/missions entre appareils ou P2P du Compagnon ;
    sur téléphone l'option auto n'apparaît pas (aucune promesse
    cassée), la vérification côté Compagnon est déjà prête.
- **Ordre de suite recommandé** : tester le `.deb`, le verrou PRF, l'anneau
  et les parcours Compagnon sur matériel réel. Ensuite : récupération des
  résultats d'analyse après fermeture, C8, MCP, connexions OAuth externes,
  puis distribution multi-OS.
  Les ajustements visuels écran par écran restent un chantier séparé avec le
  mainteneur.
- **Première vérification à la prochaine reprise** :
  `git log --oneline -8 && git status`, puis
  `node tests/e2e/unitaires.mjs` (**79/79 attendus**) et
  `node tests/e2e/tous.mjs`. Pour le natif :
  `cargo test --locked --manifest-path compagnon/Cargo.toml`,
  `cargo build --locked --manifest-path compagnon/Cargo.toml -p oc-compagnon`,
  puis les trois `e2e-compagnon-*.mjs`.
