# Fable 5 — feuille de route opérationnelle

États possibles : `à faire` · `en cours` (une seule à la fois) · `bloquée` · `terminée`.
Ordre conforme à `SPECIFICATIONS.md` §15 : le structurant et le risqué d'abord
(coffre, appareils, moteur de campagne), dans le respect des dépendances.
L'UX suit `UX-PLAN.md` (validé) sans réinterprétation.

## Études & UX

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| E1 | Étude de faisabilité v1 + v2 (8 arbitrages) | Études livrées, arbitrages D1–D12 consignés | — | terminée | Décisions dans `CONTEXT.md` |
| E2 | Plan UX complet | Livré, validé le 2026-07-16 | E1 | terminée | `UX-PLAN.md` |
| E3 | Consigner la direction UX choisie | D13–D16 dans `CONTEXT.md`, `UX-PLAN.md` créé | E2 | terminée | Relecture mainteneur |

## Phase 0 — Socle coffre (moteur seul)

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P0-1 | `engine/vault.js` : clé maîtresse, wrap PIN / phrase de secours / PRF, enveloppe valeur `OCV1.` versionnée | Fonctions pures + vecteurs de test figés | E3 | terminée | 5 tests coffre verts (vecteurs figés, mauvais code, AAD, rotation, PRF) |
| P0-2 | Couche chiffrante dans `engine/storage.js` (mêmes clés, valeurs enveloppées) + clé méta `oc_vault_v1` | Activation/désactivation sans perte ; lecture des valeurs claires héritées | P0-1 | terminée | `verrou` testé ; CONTRAT.md §1 à jour ; seal-all/open-all couverts par le Playwright de P1 |

## Phase 1 — Verrou (UX profil protégé)

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P1-1 | Parcours création (code 6 chiffres, phrase de secours, sauvegarde chiffrée **bloquante** — D15) + écran verrouillé plein écran + verrouillage auto (5/15 min) + bloc sécurité visible dans Moi (D14, D16) | Conforme à `UX-PLAN.md` §2 | P0-2 | terminée | E2E Playwright vert (390+1280, clair+sombre, scellement OCV1 vérifié en IndexedDB, mauvais code, délai, clavier) |
| P1-2 | Re-authentification code des gestes sensibles (restaurer, rompre le lien, changer la phrase, retirer un appareil) ; `oc_sync_v1`/`oc_promo_v1` sous coffre (SEALABLE) | Secrets chiffrés au repos | P1-1 | terminée | requireCode branché ; scellement couvert par vaultSealAll |
| P1-3 | PRF/biométrie (amélioration progressive, repli code) | Déverrouillage accéléré si supporté | P1-1 | terminée (code) | **Reste : test manuel Chrome/Safari sur vrai matériel** — chemin silencieusement absent sinon |

## Phase 2 — Appareil principal

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P2-1 | Identités d'appareil signées Ed25519 + registre à générations (`oc_devring_v1`, anneau signé en bloc, seq monotone) | Compat sync existante préservée | P0-2 | terminée | 5 tests anneau verts (TOFU, falsification, ban/gen, transfert, récupération) |
| P2-2 | Commandes signées : verrouiller, retirer, bannir+gen+1, effacer (bonne foi), transfert du rôle + feuille d'appareil (UX-PLAN §3) | Appliquées à la reconnexion (elles voyagent dans l'anneau) | P2-1 | terminée | actionsFor idempotent testé ; retour d'un banni ignoré testé |
| P2-3 | Récupération d'urgence par phrase de secours : rotation coffre + rescellement + anneau repris + sauvegarde obligatoire (D7) | Parcours complet UX | P2-2, P1-1 | terminée | E2E Playwright `e2e-recuperation.mjs` vert (gen coffre 2, gen anneau 2, ancien code refusé) |

## Phase 3 — Moteur de campagnes (avancé tôt : risqué et structurant)

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P3-1 | `engine/campaign.js` : machine à états pure, ids d'envoi stables `id.cible.étape`, modèle Fixe (relances calées sur l'envoi réel, cadence 15/j glissante, opposition imposée, arrêt sur réponse) | `oc_campaigns_v1` documentée au CONTRAT (scellée) | P0-1 | terminée | 4 tests verts : rejeu du journal sans doublon, cadence/glissement, J+7 réel, bords de date |

## Phase 4 — Envoi direct navigateur

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P4-1 | `engine/mime.js` + fournisseurs Gmail / Outlook isolés (client OAuth configurable, PKCE) ; CSP élargie | « Envoyer » dans la feuille Écrire ; adresse d'envoi visible ; brouillon jamais perdu | P1-2 | à faire | Doubles de fournisseurs testés ; essai réel dès qu'un client OAuth est déclaré |
| P4-2 | Feuille « Connexions » dans Moi (messagerie) | États connecté/expiré/déconnecté | P4-1 | à faire | Matrice d'états UX |

## Phase 5 — Campagnes (UX)

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P5-1 | Parcours : bifurcation Prospecter → message → contrôle → code ; ligne groupée quotidienne dans Aujourd'hui + feuille du jour (D13) ; pause/arrêt ; tags fiche/board | Conforme `UX-PLAN.md` §6 | P3-1, P4-1 | à faire | Playwright ; états pause/reprise/annulation/réponse |
| P5-2 | Exécution app ouverte (déclenchée par l'utilisateur) + rattrapage/glissement au lendemain | Aucun envoi double après fermeture/rouverture | P5-1 | à faire | Test de reprise |

## Phase 6 — IA (rédaction + aides)

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P6-1 | Aides sans IA : relances dues, priorisation locale, signature→contact (heuristique) | Actions directes dans les parcours existants | P3-1 | à faire | Tests moteur |
| P6-2 | Connexions IA (clé Anthropic/Gemini navigateur ; OpenAI/OpenRouter marqués « via ton ordinateur ») + brouillon IA dans le composeur | Relecture obligatoire ; repli gabarit | P4-2 | à faire | États quota/indisponible/clé invalide |

## Phase 7 — Compagnon v1

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P7-1 | Contrat de missions idempotentes (moteur) + appairage code court côté PWA + présence dans « Mes appareils » | Canal local garanti ; P2P si prototype fiable (D4) | P2-2 | à faire | Missions idempotentes multi-canaux |
| P7-2 | App Tauri (projet distinct) : trousseau OS, envois app fermée, rattrapage | Kill/redémarrage sans doublon | P7-1, P3-1 | à faire | Test d'intégration faux SMTP — **nécessite un environnement de build dédié** |
| P7-3 | Lecture Gmail (mot de passe d'app, D8) + Outlook OAuth → détection de réponses | Relances annulées sur réponse | P7-2 | à faire | Faux IMAP ; états UX |

## Phase 8 — Analyser mes e-mails, MCP local

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P8-1 | Source « Depuis mes e-mails » dans Recevoir : périmètre borné → travail visible → aperçu multi-sélection → fusion ; chip Aujourd'hui | Aucune création silencieuse | P7-1 | à faire | Corpus de test avec e-mails piégés (injection) |
| P8-2 | Serveur MCP local (lecture limitée + propositions) | Écritures = propositions via aperçu | P7-2 | à faire | Client MCP de test ; aucune suppression exposée |

Reportés (hors V1) : multi-profils UI, modèle Cadré visible, MCP distant/relais,
Yahoo/iCloud/Zoho/Proton, suivi d'ouvertures, portage Capacitor.
