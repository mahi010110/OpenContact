# Fable 5 — point de reprise (checkpoint)

- **Phase actuelle** : études terminées (faisabilité v1+v2, plan UX complet
  livré en discussion le 2026-07-15). **Aucune implémentation commencée.**
- **Branche Git** : `claude/opencontact-repo-study-3bw0ju`
- **Commit de base** : `9baa642` (état de l'app, inchangé par ce chantier)
- **Dernier commit utile** : voir `git log -1` — création de `docs/fable5/`
- **Dernière tâche terminée** : E2 — plan UX complet (audit UX, 3 propositions,
  parcours détaillés, wireframes, microcopie, matrice d'états, protocole de
  validation, décisions UX restantes), livré en discussion.
- **Tâche en cours** : aucune. E3 est **bloquée** en attente des arbitrages UX
  du mainteneur (proposition recommandée : « Le fil » ; décisions restantes
  listées en fin de plan UX).
- **Fichiers modifiés** : uniquement `docs/fable5/{CONTEXT,PLAN,HANDOFF}.md`.
  Aucun fichier de l'application touché.
- **Tests exécutés** : aucun nécessaire (aucun code applicatif modifié) ;
  l'app est à `?test` vert au commit de base.
- **Décisions/blocages ouverts** : arbitrages UX (nom du verrou, foyer des
  imports IA, mode de relecture des campagnes, colonne « En cours » desktop,
  formulation de l'automatisation, découverte du Compagnon sur mobile) —
  liste exacte en fin du plan UX livré en discussion.
- **Risques / précautions pour la reprise** : ne pas commencer P0 sans E3 ;
  trois hypothèses externes à re-vérifier au moment de coder : crédits
  Agent SDK Claude (annonce 2026-06), Trystero sous Node (canal P2P du
  Compagnon), CORS Zoho/OpenRouter.
- **Prochaine action exacte** : recueillir les décisions UX du mainteneur,
  les consigner dans `CONTEXT.md` (tâche E3), passer E3 à `terminée`,
  puis démarrer P0-1 (`engine/vault.js`, moteur pur + tests).
- **Première vérification à lancer en reprise** :
  `git log --oneline -5 && git status` puis servir le dossier
  (`python3 -m http.server`) et ouvrir `http://localhost:8000/?test`
  (tous les tests doivent être verts avant toute modification).
