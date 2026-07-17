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
| E4 | Étude Rust vs Node.js pour le cœur permanent du Compagnon | `ETUDE-COMPAGNON.md` — recommandation : hybride Tauri (adaptateurs Rust + cerveau JS `engine/` partagé) | E1 | **terminée — arbitrage mainteneur attendu (D17, D18)** | Aucun code Compagnon avant l'arbitrage |

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
| P4-1 | `engine/mailer.js` (MIME RFC 2047/2822, Gmail implicite + Outlook PKCE, envoi confirmé par le fournisseur seulement) + `oauth.html` ; CSP élargie au strict nécessaire | « Envoyer » primaire dans Écrire quand connecté ; « Depuis {adresse} » visible ; expiration → feuille Reconnecter, brouillon intact ; `mailto:` intact sinon | P1-2 | terminée | 2 tests moteur + E2E interception réseau (`e2e-envoi.mjs`) vert — **essai réel bloqué : déclarer les apps OAuth Google/Microsoft (mainteneur)** |
| P4-2 | Feuille « Connexions » dans Moi (messagerie) — exige le verrou (D9), code re-demandé, option avancée « son propre client OAuth » | États connecté (adresse) / expiré / non connecté | P4-1 | terminée | E2E : ligne Moi + états ; jetons scellés (`oc_mail_v1`) |

## Phase 5 — Campagnes (UX)

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P5-1 | Parcours : bifurcation Prospecter → message (relances J+7/J+14 éditables, dates figées) → contrôle (récap, aperçus remplis, écartées, adresse d'envoi) → code ; ligne groupée quotidienne dans Aujourd'hui + feuille du jour (envoi par ligne + Tout envoyer — D13) ; pause/reprise/arrêt ; réconciliation réponse (statut fiche) ; tags « en campagne » liste/board | Conforme `UX-PLAN.md` §6 | P3-1, P4-1 | terminée | E2E `e2e-campagne.mjs` vert (bifurcation → envois interceptés → réponse → relances annulées → board) |
| P5-2 | Exécution app ouverte (déclenchée par l'utilisateur) + glissement au lendemain | Aucun envoi double après fermeture/rouverture | P5-1 | terminée | Idempotence par ids stables (tests moteur) ; glissement testé ; erreurs marquées jamais re-tentées |

## Phase 6 — IA (rédaction + aides)

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P6-1 | Aides sans IA : `engine/assist.js` — priorisation locale des retards (retard puis pistes travaillées, branchée sur « En retard »), signature collée → contact (champs vides seulement, éditeur de contact) | Actions directes dans les parcours existants | P3-1 | terminée | 2 tests moteur verts |
| P6-2 | Connexions IA (`engine/ai.js` : Anthropic/Gemini par clé navigateur ; OpenAI/OpenRouter/Ollama/ChatGPT marqués « via ton ordinateur ») + « Proposer un brouillon » dans le composeur (texte dans le champ éditable) + groupe IA dans Connexions (`oc_ai_v1` scellée) | Relecture obligatoire ; repli gabarit ; le prompt ne porte que la piste, jamais le suivi privé | P4-2 | terminée | 1 test moteur + E2E `e2e-ia.mjs` vert (proposition interceptée, quota, rien de perdu) |

## Phase V — vérification & durcissement avant fusion

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| V1 | Coffre : rotation interruptible sans perte | `prev` dans `oc_vault_v1` (ancienne clé scellée sous la nouvelle), méta écrite AVANT le re-scellement, reprise automatique au déverrouillage, `vaultReseal` reprenable | P2-3 | terminée | 2 tests unitaires (rotation interrompue + re-scellement reprenable) ; CONTRAT §1 |
| V2 | Service worker : le retour OAuth n'est plus détourné | Navigation vers `oauth.html` servie telle quelle (l'app une-page garde le reste) ; favicon de la popup | P4-1 | terminée | E2E `e2e-oauth-sw.mjs` (SW au contrôle, popup + postMessage réels) ; `sw.js` → oc-v23 |
| V3 | Effacement distant complet | `wipe` emporte AUSSI campagnes, jetons messagerie, clés IA, missions, relais, identité d'appareil et documents (`cv`, `lettre`) | P2-2 | terminée | Liste au CONTRAT §5.7 |
| V4 | Plafond 15/j GLOBAL + fenêtre d'envoi | `dueSendsAll`/`sentTodayAll` (toutes campagnes), `inSendWindow` (lun–ven 8-19 h locales) ; feuille du jour : boutons retenus hors fenêtre, reste « glisse à demain » | P5-1 | terminée | 1 test unitaire (plafond global + fenêtre) + E2E campagne (samedi = retenu) |
| V5 | Tests Playwright versionnés | `tests/e2e/` : outillage sans chemin en dur, 7 scénarios + `unitaires.mjs` + `tous.mjs` + README | — | terminée | `node tests/e2e/tous.mjs` : 8/8 verts |
| V6 | Stockage : connexion IndexedDB fermée de force (navigateurs mobiles sous pression mémoire) | Réouverture à la demande + une re-tentative par requête — plus jamais un `null` silencieux sur connexion morte | — | terminée | Découvert par les E2E (Chromium évince les contextes éphémères) ; suite 8/8 stable |

## Phase 7 — Compagnon v1

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P7-1 | Contrat de missions idempotentes (`engine/mission.js` : bornées, révocables, rapport replié sur le journal de campagne sans doublon, `oc_missions_v1` au CONTRAT) | Le socle que le binaire Tauri consommera | P2-2 | **terminée (moteur)** | Test vert : rejeu de rapport multi-canaux sans doublon, expiration, révocation. Reste : appairage code court + présence « Mes appareils » quand le binaire existera |
| P7-2 | App Tauri : trousseau OS, envois app fermée, rattrapage | Kill/redémarrage sans doublon | P7-1, P3-1 | **reprise — voir chantier C ci-dessous** (D17/D18 validés, environnement de build disponible) | — |
| P7-3 | Lecture Gmail (mot de passe d'app, D8) + Outlook OAuth → détection de réponses | Relances annulées sur réponse | P7-2 | reprise — C5 | Faux IMAP ; états UX |

## Chantier Compagnon (D17/D18 — `compagnon/`, hybride Tauri)

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| C1 | Socle : crate `coeur` (garde D17 : mission signée, anti-double-envoi, plafond global, fenêtre) + coquille Tauri (tray, arrière-plan, démarrage auto, fenêtre de réglages) + cerveau qui charge le moteur partagé (`preparer.mjs`) + fil signé côté moteur JS (`signMission`/`openMissionWire`) | Tout compile, la garde est testée, le vecteur signé JS se vérifie en Rust | E4 | terminée | `cargo test -p oc-coeur` ; test JS « fil signé » ; build + lancement xvfb (« compagnon : prêt ») |
| C2 | Canal local (serveur 127.0.0.1, enveloppes `OCV1.` uniquement) + appairage code court (PBKDF2 partagé, 5 essais, 2 min) + secrets au trousseau (repli fichier 0600) + le Compagnon dans « Mes appareils » (associer, présence prêt/éteint, rompre) | Anneau appris (TOFU canal authentifié par le code), rôle `companion`, clé de canal scellée (`oc_companion_v1`) | C1 | terminée | `cargo test` 12/12 (vecteurs enveloppe + dérivation) ; E2E `e2e-compagnon.mjs` (faux Compagnon au protocole exact : mauvais code, association, présence, rupture) ; canal du VRAI binaire interrogé sous xvfb. Au passage : le SW ne touche plus aux requêtes hors origine (il mettait en cache les réponses d'API) |
| C3 | Missions : la PWA confie une campagne signée, le Compagnon la reçoit, la garde re-vérifie | Révocation immédiate ; états hors ligne | C2 | à faire | Vecteurs + E2E |
| C4 | Exécution app fermée : planificateur (fenêtre, plafond global), envois par la coquille, journal persisté, rapport replié sans doublon | Kill/redémarrage sans doublon | C3 | à faire | Test kill/restart |
| C5 | Messageries : Gmail mot de passe d'application (trousseau), Outlook OAuth ; détection de réponses (IMAP en-têtes) | Relances annulées sur réponse | C4 | à faire | Faux IMAP local |
| C6 | Analyse d'e-mails : périmètre choisi → runtime IA (Ollama d'abord) → enveloppe `share` → aperçu contrôlé de la PWA | Aucune création silencieuse | C5 | à faire | Corpus piégé |
| C7 | États & finitions : hors ligne, erreurs, autorisations, révocations partout ; docs | UX complète, rien de moteur sans parcours | C3–C6 | à faire | Relecture UX-PLAN |

## Phase 8 — Analyser mes e-mails, MCP local

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P8-1 | Source « Depuis mes e-mails » dans Recevoir : parcours guidé V1 (copier le prompt du profil → coller la réponse de l'IA) → **aperçu multi-sélection** (une proposition d'IA se trie) → fusion + Annuler ; le chemin automatique se branchera sur la même feuille avec le Compagnon | Aucune création silencieuse | P7-1 | terminée (V1 guidée) | E2E `e2e-analyse.mjs` vert : tri des propositions, lien `javascript:` neutralisé, confiance non transmise. Reste : chemin auto + chip Aujourd'hui (avec Compagnon) |
| P8-2 | Serveur MCP local (lecture limitée + propositions) | Écritures = propositions via aperçu | P7-2 | bloquée (P7-2) | Client MCP de test ; aucune suppression exposée |

Reportés (hors V1) : multi-profils UI, modèle Cadré visible, MCP distant/relais,
Yahoo/iCloud/Zoho/Proton, suivi d'ouvertures, portage Capacitor.
