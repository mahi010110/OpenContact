# Fable 5 — point de reprise (checkpoint)

- **Phase actuelle** : implémentation lancée (plan UX validé le 2026-07-16,
  arbitrages D13–D16 consignés).
- **Branche Git** : `claude/opencontact-repo-study-3bw0ju`
- **Commit de base de l'app** : `9baa642` (inchangé tant que P0 n'a pas livré)
- **Dernière tâche terminée** : P0 (coffre moteur) — `engine/vault.js`
  (clé maîtresse, wraps code/phrase/PRF, enveloppes `OCV1.`, 256 mots) +
  couche scellante dans `engine/storage.js` (`SEALABLE`, `vaultAttach`,
  `vaultSealAll/OpenAll/Reseal`, `kvDel`) ; `CONTRAT.md` §1 et `sw.js`
  (oc-v15) à jour.
- **Tâche en cours** : P1-1 (verrou : bloc sécurité dans Moi, création,
  écran verrouillé, verrouillage auto).
- **Tests exécutés** : `?test` **58/58 verts** (Chromium headless), dont
  5 tests coffre + 1 test stockage scellé ; vecteurs figés (méta v1, OCV1).
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
