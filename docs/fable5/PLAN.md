# Fable 5 — feuille de route opérationnelle

États possibles : `à faire` · `en cours` (une seule à la fois) · `bloquée` · `terminée`.
Les phases techniques viennent de l'étude consolidée v2 (livrée en discussion,
décisions figées dans `CONTEXT.md`).

## Études & UX

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| E1 | Étude de faisabilité v1 + v2 (8 arbitrages) | Études livrées, arbitrages D1–D12 consignés | — | terminée | Décisions dans `CONTEXT.md` |
| E2 | Plan UX complet (audit, 3 propositions, parcours, wireframes, microcopie, états) | Livré en discussion ; choix du mainteneur attendu | E1 | terminée | Décisions UX restantes listées |
| E3 | Consigner la direction UX choisie dans `CONTEXT.md` | Section « Décisions acquises » complétée (UX) | E2 + arbitrage mainteneur | bloquée | Relecture mainteneur |

## Phase 0 — Socle coffre (moteur seul)

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P0-1 | `engine/vault.js` : clé maîtresse, wrap PIN / phrase de secours / PRF, enveloppe valeur `OCV1.` versionnée | Fonctions pures + vecteurs de test figés | E3 | à faire | `?test` : cycle chiffrer/déchiffrer, mauvais PIN, rotation, vecteurs stables |
| P0-2 | Couche chiffrante dans `engine/storage.js` (mêmes clés, valeurs enveloppées) + clé méta `oc_vault_v1` | Activation/désactivation sans perte ; lecture des valeurs claires héritées | P0-1 | à faire | Migration aller/retour testée ; CONTRAT.md §1 mis à jour |

## Phase 1 — Verrou (UX profil protégé)

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P1-1 | Parcours création (PIN, phrase de secours, sauvegarde initiale) + écran de déverrouillage + verrouillage auto (5/15 min) | Conforme au plan UX validé | P0-2 | à faire | Playwright 390+1280, clair+sombre ; sans profil protégé : zéro différence visible |
| P1-2 | Re-authentification PIN des gestes sensibles ; `oc_sync_v1`/`oc_promo_v1` sous coffre | Secrets chiffrés au repos | P1-1 | à faire | Assertions stockage ; tests moteur |
| P1-3 | PRF/biométrie (amélioration progressive, repli PIN) | Déverrouillage accéléré si supporté | P1-1 | à faire | Test manuel Chrome/Safari |

## Phase 2 — Appareil principal

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P2-1 | Identités d'appareil signées + registre à générations (`oc_devring_v1`) | Compat sync existante préservée | P0-2 | à faire | Tests : signatures invalides rejetées, convergence |
| P2-2 | Commandes signées : verrouiller, retirer, bannir+rotation, effacer (bonne foi), transfert du rôle | Appliquées à la reconnexion si hors ligne | P2-1 | à faire | Tests deux contextes : révocation hors ligne, retour d'un banni |
| P2-3 | Récupération d'urgence par phrase de secours + sauvegarde obligatoire (D7) | Parcours complet UX | P2-2, P1-1 | à faire | Scénario Playwright bout en bout |

## Phase 3 — Envoi direct navigateur

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P3-1 | `engine/mime.js` + fournisseurs Gmail (GIS) / Outlook (MSAL) isolés ; CSP élargie | « Envoyer » dans la feuille Écrire ; adresse d'envoi visible | P1-2 | à faire | Envoi réel testé ; expiration → reconnexion sans perte du brouillon |
| P3-2 | Carte « Connexions » dans Moi (messagerie) | États connecté/expiré/déconnecté | P3-1 | à faire | Matrice d'états UX |

## Phase 4 — Campagnes fixes

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P4-1 | `engine/campaign.js` : machine à états pure, ids d'envoi idempotents, modèle Fixe (+ Cadré présent mais inactif) | `oc_campaigns_v1` documentée au CONTRAT | P0-1 | à faire | Propriété anti-double-envoi (rejouer le journal) ; bords de date |
| P4-2 | Parcours UX : sélection → objectif → messages → contrôle → PIN → suivi (préparation par défaut) | Conforme plan UX validé | P4-1, P3-1 | à faire | Playwright ; états pause/reprise/annulation/réponse |
| P4-3 | Exécution app ouverte + rattrapage à l'ouverture | Aucun envoi double après fermeture/rouverture | P4-2 | à faire | Test de reprise |

## Phase 5 — IA (rédaction + aides)

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P5-1 | Aides sans IA : relances dues, priorisation locale, signature→contact (heuristique) | Actions directes dans les parcours existants | P4-1 | à faire | Tests moteur |
| P5-2 | Connexions IA (clé Anthropic/Gemini navigateur ; OpenAI/OpenRouter marqués « via Compagnon ») + brouillons IA dans le composeur | Relecture obligatoire ; repli gabarit | P3-2 | à faire | États quota/indisponible/clé invalide |

## Phase 6 — Compagnon v1

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P6-1 | App Tauri : appairage code court, trousseau OS, présence dans « Mes appareils » | Canal local garanti ; P2P si prototype fiable (D4) | P2-2 | à faire | Missions idempotentes multi-canaux |
| P6-2 | Bons de mission campagne (expiration, révocation) + envois app fermée + rattrapage | Kill/redémarrage sans doublon | P6-1, P4-1 | à faire | Test d'intégration faux SMTP |
| P6-3 | Lecture Gmail (mot de passe d'app, D8) + Outlook OAuth → détection de réponses | Relances annulées sur réponse | P6-2 | à faire | Faux IMAP ; états UX |

## Phase 7 — IA Compagnon, Analyser mes e-mails, MCP local

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P7-1 | Runtimes : Ollama, clés API, Codex App Server (sign-in ChatGPT) ; Claude si D5-② confirmé | Connexion testable depuis la PWA | P6-1 | à faire | États indisponible/quota |
| P7-2 | « Analyser mes e-mails » : périmètre borné → IA → `share` → aperçu avant fusion | Aucune création silencieuse | P7-1, P6-3 | à faire | Corpus de test avec e-mails piégés (injection) |
| P7-3 | Serveur MCP local (lecture limitée + propositions) | Écritures = propositions via aperçu | P6-1 | à faire | Client MCP de test ; aucune suppression exposée |

Reportés (hors V1) : multi-profils UI, modèle Cadré visible, MCP distant/relais,
Yahoo/iCloud/Zoho/Proton, suivi d'ouvertures, portage Capacitor.
