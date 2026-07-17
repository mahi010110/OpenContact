# Fable 5 — point de reprise (checkpoint)

- **Phase actuelle** : chantier connecté V1 livré côté PWA (P0 → P8-1),
  **durci par la phase V** (pré-fusion) ; le Compagnon (D17/D18 validés)
  démarre dans `compagnon/`.
- **Phase V (durcissement) livrée** : rotation du coffre interruptible et
  reprenable (`prev` dans `oc_vault_v1`), le SW ne détourne plus
  `oauth.html` (oc-v23), `wipe` complet (jetons, clés IA, campagnes,
  missions, documents), plafond 15/j **global** + fenêtre d'envoi
  lun–ven 8-19 h (`dueSendsAll`, `inSendWindow`), tests Playwright
  versionnés dans `tests/e2e/` (8 scénarios, `node tests/e2e/tous.mjs`),
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
- **Tests** : `?test` **77/77 verts** ; **8 scénarios Playwright dans
  `tests/e2e/`** (verrou, récupération, envoi, campagne + fenêtre, IA,
  analyse, oauth-sw, unitaires) — tous verts, thèmes clair/sombre,
  390/1280, zéro erreur console. `sw.js` → **oc-v23**.
- **Blocages externes (dans l'ordre d'importance)** :
  1. **Apps OAuth Google/Microsoft à déclarer par le mainteneur** —
     renseigner les IDs publics dans `MAIL_CLIENTS` (`engine/mailer.js`),
     puis essai réel d'envoi (l'option avancée de Connexions permet de
     tester avec son propre client avant).
  2. **Compagnon (Tauri)** = projet distinct : consommer
     `engine/mission.js`, appairage code court, IMAP/lecture (D8), MCP
     local (P7-2, P7-3, P8-2). Nécessite un environnement de build dédié.
  3. Tests manuels sur vrai matériel : biométrie PRF (P1-3), commandes
     d'anneau entre deux vrais appareils (transport Trystero).
- **Compagnon (D17/D18 validés — chantier C en cours, `compagnon/`)** :
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
  - Suite : C3 missions confiées, C4 exécution app fermée, C5
    messageries, C6 analyse, C7 états (PLAN.md).
- **Prochaine action exacte** : au choix du mainteneur — arbitrer l'étude
  Compagnon (D17/D18), déclarer les apps OAuth (débloque l'envoi réel).
  Côté PWA, tout nouveau travail = relire `UX-PLAN.md` et repartir des
  états « bloquée » de `PLAN.md`.
- **Première vérification à lancer en reprise** :
  `git log --oneline -8 && git status`, servir le dossier
  (`python3 -m http.server`) et ouvrir `http://localhost:8000/?test`
  (74/74 attendus avant toute modification).
