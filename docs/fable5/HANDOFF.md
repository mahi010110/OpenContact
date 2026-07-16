# Fable 5 — point de reprise (checkpoint)

- **Phase actuelle** : implémentation lancée (plan UX validé le 2026-07-16,
  arbitrages D13–D16 consignés).
- **Branche Git** : `claude/opencontact-repo-study-3bw0ju`
- **Commit de base de l'app** : `9baa642` (inchangé tant que P0 n'a pas livré)
- **Dernière tâche terminée** : P1 (verrou complet) — `ui/verrou.js`
  (écran verrouillé plein écran, pavé réutilisable, création en feuille
  avec phrase + sauvegarde bloquante, délai progressif persistant,
  « Code oublié ? » → phrase → nouveau code, biométrie PRF optionnelle,
  verrouillage auto 5/15 min, `requireCode`), bloc sécurité dans Moi,
  re-auth branchée dans `moi.js`/`direct.js`, styles verrou, `sw.js`
  → oc-v16. La clé RESTE attachée quand l'écran se verrouille (la sync
  et une campagne validée continuent — D6).
- **Tâche en cours** : P2-1 (identités d'appareil signées, `oc_devring_v1`).
- **Tests exécutés** : `?test` **59/59 verts** ; E2E Playwright
  (`scratchpad/e2e-verrou.mjs`) : création complète au tap, scellement
  OCV1 vérifié dans IndexedDB, rechargement → verrou, mauvais code,
  déverrouillage tactile + clavier, thèmes clair/sombre, zéro erreur
  console. Reste manuel : biométrie PRF sur vrai matériel (P1-3).
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
