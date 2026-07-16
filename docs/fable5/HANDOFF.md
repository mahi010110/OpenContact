# Fable 5 — point de reprise (checkpoint)

- **Phase actuelle** : implémentation lancée (plan UX validé le 2026-07-16,
  arbitrages D13–D16 consignés).
- **Branche Git** : `claude/opencontact-repo-study-3bw0ju`
- **Commit de base de l'app** : `9baa642` (inchangé tant que P0 n'a pas livré)
- **Dernière tâche terminée** : P2 (appareil principal) — `engine/ring.js`
  (anneau Ed25519 signé en bloc par le principal, clé de secours dérivée
  de la phrase → récupération vérifiable hors ligne, générations
  anti-rétrogradation, seq monotone signé), intégration `synclive.js`
  (hello+pub, action `ring`, auto-ajout par le principal, application
  des commandes une seule fois, wipe local honnête), feuille d'appareil
  dans `direct.js` (verrouiller/retirer/bannir/effacer/transférer, code
  re-demandé), récupération d'urgence D7 complète dans `verrou.js`
  (rotation coffre + rescellement + anneau repris + sauvegarde
  bloquante). `sw.js` → oc-v17.
- **P3-1 terminée** : `engine/campaign.js` (modèle Fixe pur,
  anti-double-envoi par ids stables + journal). `oc_campaigns_v1` scellée.
- **P4 terminée** : envoi direct — `engine/mailer.js` (MIME, Gmail
  implicite / Outlook PKCE, clients OAuth publics configurables,
  « parti » seulement sur confirmation du fournisseur), `oauth.html`
  (popup → postMessage même origine), `ui/connexions.js` (feuille
  Connexions : verrou exigé, code re-demandé, états connecté/expiré/
  déconnecté, option avancée client OAuth), feuille Écrire connectée
  (« Depuis {adresse} », Envoyer primaire, Ctrl/Cmd+Entrée, expiration
  → Reconnecter sans perte du brouillon, mailto intact sinon), ligne
  Connexions dans Moi, CSP élargie, `oc_mail_v1` scellée. **Blocage
  externe assumé : les apps OAuth Google/Microsoft restent à déclarer
  par le mainteneur (IDs publics à renseigner dans MAIL_CLIENTS).**
- **Tâche en cours** : P5-1 (parcours campagne : bifurcation Prospecter,
  contrôle, ligne quotidienne dans Aujourd'hui — D13).
- **Tests exécutés** : `?test` **64/64 verts** ; E2E `e2e-verrou.mjs`
  (régression P1) + `e2e-recuperation.mjs` (D7 bout en bout : coffre
  gen 2, anneau gen 2, ancien code refusé, nouveau accepté, donnée
  re-scellée relue), zéro erreur console. Restes manuels : biométrie
  PRF sur vrai matériel ; commandes d'anneau entre deux vrais appareils
  (le moteur est couvert, le transport Trystero n'est pas simulable ici).
- **Décisions/blocages ouverts** : aucun blocage. Hypothèses externes à
  vérifier au moment concerné : scope Gmail `gmail.send` (P4), WebAuthn PRF
  (P1-3), Local Network Access / Trystero-Node (P7), abonnement Claude
  (P6-2), CORS Zoho/OpenRouter (P6-2).
- **Risques / précautions** : le binaire Compagnon (P7-2) exige un
  environnement de build Tauri dédié — hors du conteneur de cette session ;
  tout le reste (contrats moteur, appairage, UI) se fait côté PWA.
- **Prochaine action exacte** : implémenter `engine/vault.js` (P0-1) —
  clé maîtresse AES-GCM, wraps PIN/phrase de secours/PRF, enveloppe `OCV1.`,
  vecteurs de test dans `tests.js` ; puis P0-2 (couche stockage).
- **Première vérification à lancer en reprise** :
  `git log --oneline -5 && git status` puis servir le dossier
  (`python3 -m http.server`) et ouvrir `http://localhost:8000/?test`
  (tous les tests doivent être verts avant toute modification).
