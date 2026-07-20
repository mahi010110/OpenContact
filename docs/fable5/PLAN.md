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
| E4 | Étude Rust vs Node.js pour le cœur permanent du Compagnon | `ETUDE-COMPAGNON.md` — recommandation : hybride Tauri (adaptateurs Rust + moteur partagé, garde native) | E1 | **terminée — D17/D18 validés** | Arbitrage consigné dans `CONTEXT.md` ; retour d'implémentation C1–C8 ajouté à l'étude |
| E5 | Corriger les priorités de `AUDIT-UX.md` sans redesign | Actions mortes, pont mobile, relais, cibles tactiles et finitions rendus honnêtes | E2 | **terminée — priorités** | 79/79 unitaires ; 10/10 scénarios joués verts, 3 natifs sautés explicitement ; revue écran par écran reportée |

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
| P6-2 | Connexions IA (`engine/ai.js` : Claude/Gemini par clé navigateur ; OpenAI/OpenRouter/Ollama/ChatGPT visibles mais « pas encore disponibles » et non activables) + « Proposer un brouillon » dans le composeur (texte dans le champ éditable) + groupe IA dans Connexions (`oc_ai_v1` scellée) | Relecture obligatoire ; repli gabarit ; aucune promesse d'adaptateur non livré ; le prompt ne porte que la piste, jamais le suivi privé | P4-2 | terminée | 1 test moteur + E2E `e2e-ia.mjs` et `e2e-ux-audit.mjs` verts |
| P6-3 | Les trois familles D5 **complètes**, sans modèle implicite : OpenRouter en clé navigateur (CORS confirmé chez le fournisseur) ; Ollama, OpenAI et l'abonnement ChatGPT « via ton ordinateur » — canal `ia-demarrer`/`ia-etat`/`ia-annuler` du Compagnon (asynchrone, annulable, le canal reste vif), garde pure `oc_coeur::ia` (vocabulaire fermé, bornes d'entrée ET de sortie `TEXTE_MAX`, clé exigée). **Le modèle se choisit dans la liste que chaque runtime sert VRAIMENT** : `/v1/models` (Anthropic, OpenAI), `ListModels` (Gemini — 2.0 Flash est mort le 2026-06-01, la leçon est retenue), `/api/v1/models` (OpenRouter), tags Ollama, et `codex app-server` → `model/list` pour l'abonnement ChatGPT (GPT-5.5/5.6/variantes selon le compte). Génération ChatGPT par `codex exec` non interactif : prompt par STDIN (jamais dans `ps`), bac à sable lecture seule (ni écriture, ni commande, ni réseau), cadrage donnée≠instruction, `--model` choisi | Ce qui est affiché est ce qui est utilisé ; la clé OpenAI sert l'appel puis s'oublie — jamais écrite chez le Compagnon ; fermer la feuille annule vraiment (travail tué ou jeté, verrou libéré) ; toute attente a une échéance ; erreurs en codes courts traduits par la PWA ; texte toujours dans le champ éditable | P6-2, C2 | **terminée** | 5 tests Rust `oc_coeur::ia` + tests moteur JS (jamais d'implicite) + E2E `e2e-compagnon-ia.mjs` contre le vrai binaire (listes réelles des trois runtimes factices, modèle choisi = modèle transmis, protocole app-server exact, prompt absent d'argv et présent sur stdin, `grep` de la clé sur le disque = absente, annulation qui libère, Compagnon éteint honnête, 390×844 sombre + 1280×800 clair, rejoué 3×) + `e2e-ia.mjs` (liste Anthropic vivante, refus `modele`) |

## Phase V — vérification & durcissement avant fusion

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| V1 | Coffre : rotation interruptible sans perte | `prev` dans `oc_vault_v1` (ancienne clé scellée sous la nouvelle), méta écrite AVANT le re-scellement, reprise automatique au déverrouillage, `vaultReseal` reprenable | P2-3 | terminée | 2 tests unitaires (rotation interrompue + re-scellement reprenable) ; CONTRAT §1 |
| V2 | Service worker : le retour OAuth n'est plus détourné | Navigation vers `oauth.html` servie telle quelle (l'app une-page garde le reste) ; favicon de la popup | P4-1 | terminée | E2E `e2e-oauth-sw.mjs` (SW au contrôle, popup + postMessage réels) ; `sw.js` → oc-v23 |
| V3 | Effacement distant complet | `wipe` emporte AUSSI campagnes, jetons messagerie, clés IA, missions, relais, identité d'appareil et documents (`cv`, `lettre`) | P2-2 | terminée | Liste au CONTRAT §5.7 |
| V4 | Plafond 15/j GLOBAL + fenêtre d'envoi | `dueSendsAll`/`sentTodayAll` (toutes campagnes), `inSendWindow` (lun–ven 8-19 h locales) ; feuille du jour : boutons retenus hors fenêtre, reste « glisse à demain » | P5-1 | terminée | 1 test unitaire (plafond global + fenêtre) + E2E campagne (samedi = retenu) |
| V5 | Tests Playwright versionnés | `tests/e2e/` : outillage sans chemin en dur, 14 scénarios recensés par `tous.mjs`, dont l'audit UX et 4 scénarios vrai-binaire | — | terminée | C8 : **83/83 unitaires et 14/14 scénarios verts, 0 sauté**, dont 4/4 natifs contre le binaire construit ici |
| V6 | Stockage : connexion IndexedDB fermée de force (navigateurs mobiles sous pression mémoire) | Réouverture à la demande + une re-tentative par requête — plus jamais un `null` silencieux sur connexion morte | — | terminée | Découvert par les E2E (Chromium évince les contextes éphémères) ; suite 8/8 stable |
| V7 | CI reproductible : `.github/workflows/ci.yml` (auto-tests PWA, `cargo test --locked` + build release, suite E2E complète sous xvfb avec captures en artefacts) + `paquets.yml` (bundles non signés par OS : `.deb`, installateur NSIS, `.app`+`.dmg` — icônes `.ico`/`.icns` versionnées ; la signature reste au mainteneur) | Chaque poussée vers `main` et chaque PR rejouent ce que le développement joue localement ; toute PR touchant `paquets.yml` le joue sur les trois OS | V5 | **terminée** | CI observée verte sur la PR #10 ; paquets : premier tour PR a RÉVÉLÉ ico manquant + cibles Linux-seules (corrigés), vert constaté avant fusion |

## Phase 7 — Compagnon v1

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P7-1 | Contrat de missions idempotentes (`engine/mission.js` : bornées, révocables, rapport replié sur le journal de campagne sans doublon, `oc_missions_v1` au CONTRAT) | Le socle consommé par le binaire Tauri | P2-2 | **terminée** | Fil signé JS/Rust, expiration, révocation et repli idempotent couverts ; appairage et présence livrés en C2 |
| P7-2 | App Tauri : trousseau OS, envois app fermée, rattrapage | Kill/redémarrage sans doublon | P7-1, P3-1 | **terminée — C1 à C4 + C7** | Rejoué ici contre le vrai binaire : 2 envois SMTP, kill −9, relance sans doublon, rapport PWA et reprise en main verts |
| P7-3 | Lecture Gmail (mot de passe d'app, D8) + Outlook OAuth → détection de réponses | Relances annulées sur réponse | P7-2 | **terminée pour Gmail/IMAP — Outlook OAuth attend l'app externe** | Rejoué ici : vrai binaire + faux IMAP, réponse détectée et relances arrêtées. Outlook dépend de la déclaration OAuth mainteneur |

## Chantier Compagnon (D17/D18 — `compagnon/`, hybride Tauri)

**État vérifié le 18 juillet 2026 :** le code de C1 à C8 est présent sur la
branche. Rust/Cargo 1.97.1 est installé dans l'environnement : les **20 tests
du cœur + 1 test de la coquille passent**, le binaire de développement se
construit et les **4 scénarios natifs passent contre ce vrai binaire**. Le mode explicite
`OC_INTEGRATION_TEST` neutralise uniquement les services de bureau absents du
conteneur (instance unique, démarrage automatique et zone de notification) ;
le canal, la garde, SMTP/IMAP, Ollama, la persistance et la webview restent réels.
Deux corrections de la reprise native font partie de cette base : les cycles
d'envoi sont sérialisés par `journal_lock` (plus de double premier passage sous
charge) et les commandes de démarrage automatique vérifient que le composant
est enregistré en mode intégration (plus de panique au build propre).

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| C1 | Socle : crate `coeur` (garde D17 : mission signée, anti-double-envoi, plafond global, fenêtre) + coquille Tauri (tray, arrière-plan, démarrage auto, fenêtre de réglages) + moteur partagé préparé par `preparer.mjs` + fil signé côté moteur JS (`signMission`/`openMissionWire`) | Tout compile, la garde est testée, le vecteur signé JS se vérifie en Rust | E4 | terminée | Rejoué le 2026-07-18 : 18/18 tests `oc-coeur` + 1/1 test Tauri, build et lancement xvfb (« compagnon : prêt ») ; mode intégration sans composant autostart testé sans panique |
| C2 | Canal local (serveur 127.0.0.1, enveloppes `OCV1.` uniquement) + appairage code court (PBKDF2 partagé, 5 essais, 2 min) + secrets au trousseau (repli fichier 0600) + le Compagnon dans « Mes appareils » (associer, présence prêt/éteint, rompre) | Anneau appris (TOFU canal authentifié par le code), rôle `companion`, clé de canal scellée (`oc_companion_v1`) | C1 | terminée | `cargo test` 12/12 (vecteurs enveloppe + dérivation) ; E2E `e2e-compagnon.mjs` (faux Compagnon au protocole exact : mauvais code, association, présence, rupture) ; canal du VRAI binaire interrogé sous xvfb. Au passage : le SW ne touche plus aux requêtes hors origine (il mettait en cache les réponses d'API) |
| C3 | Missions : bon signé (`{m, sig, dev}`) confié sur le canal, re-vérifié à CHAQUE lecture ; révocation (mise en file si éteint) ; arrêt de cible sur réponse ; rapport = journal replié idempotent | Contrôle de campagne : « Qui appuie sur Envoyer ? » (D13 : toi par défaut) ; ligne d'Aujourd'hui « ton ordinateur s'en occupe » ; feuille confiée (état honnête, Reprendre la main) | C2 | terminée | E2E réel (voir C4) |
| C4 | Exécution app fermée : **planificateur Rust** (`coeur/planifier.rs`, miroir du moteur JS verrouillé par fixtures croisées — la webview peut être morte, les envois partent) ; journal scellé écrit AVANT l'envoi (incertain→fait ; refus=erreur ; transitoire=re-tentable) ; SMTP lettre/rustls, réglage scellé + mot de passe au trousseau ; `journal_lock` sérialise le premier passage et la boucle périodique | Kill −9/relance et charge sans doublon | C3 | terminée | `cargo test` 18/18 (fixtures croisées) ; **E2E `e2e-compagnon-envoi.mjs` contre le VRAI binaire** : appairage réel, campagne confiée par l'assistant, 2 envois SMTP reçus par un puits local, kill −9 + relance = zéro doublon, rapport replié dans la PWA, reprise en main ; 8/8 répétitions sous charge vertes après verrou |
| C5 | Détection des réponses (D8) : IMAP en-têtes seulement (`FROM … SINCE …`, jamais le contenu), même mot de passe d'application, toutes les 10 min ; cible arrêtée non débrayable + `reponses[]` au rapport ; PWA replie (fiche « réponse », trace, relances annulées). Outlook OAuth : reporté avec l'app OAuth mainteneur | Relances annulées seules | C4 | terminée | E2E `e2e-compagnon-reponses.mjs` (vrai binaire + faux IMAP local via OC_IMAP_TEST) |
| C6 | Analyse d'e-mails : mission `mail-scan` bornée (jours, 40 messages, 100 Ko) → Ollama local → le résultat repasse par l'aperçu multi-sélection de la PWA (jamais d'écriture directe) ; annulable (révocation = rien n'est produit) ; chemin auto dans « Depuis mes e-mails » quand le Compagnon est associé ; suivi/résultat scellé dans `oc_analysis_v1` | Aucune création silencieuse ; corpus = données, jamais des instructions ; fermeture sans perte | C5 | terminée | E2E `e2e-compagnon-scan.mjs` contre le vrai binaire : fermeture/rechargement pendant Ollama, reprise par `mid`, chip Aujourd'hui, aperçu conservé après Annuler, tri/fusion sûre, injection et confiance neutralisées |
| C7 | États & finitions : éteint/rattrapage, refus/incertain/transitoire, révocations en file, docs (README compagnon, CONTRAT, HANDOFF) | UX complète, rien de moteur sans parcours | C3–C6 | terminée | Relecture UX-PLAN ; 19/19 tests Rust et 3/3 E2E vrai-binaire verts dans l'environnement de reprise |
| C8 | Missions depuis le téléphone : campagnes et bons signés empruntent la sync privée « Mes appareils » ; l'ordinateur associé remet le bon au canal local | Le téléphone propose auto si l'anneau connaît un Compagnon ; le fil signé voyage intact et un seul `mid` est confié | C4 | **terminée** | `syncPrivateMerge` testé (LWW + faits monotones) ; anneau actualisé et vérifié en Rust ; E2E `e2e-c8-telephone.mjs` contre le vrai binaire, 390×844 + 1280×800 clair/sombre, 3 exécutions : téléphone sans `oc_companion_v1` → 1 SMTP après trois rejeux, zéro erreur console |

## Phase 8 — Analyser mes e-mails, MCP local

| ID | Tâche | Résultat attendu | Dépend de | État | Acceptation / tests |
|---|---|---|---|---|---|
| P8-1 | Source « Depuis mes e-mails » dans Recevoir : parcours guidé + chemin automatique C6 → suivi scellé et repris après fermeture → chip Aujourd'hui → **aperçu multi-sélection** → fusion + Annuler | Aucune création silencieuse ; fermer la feuille, l'onglet ou l'app ne perd ni la mission ni son résultat | P7-1 | **terminée** | 2 tests unitaires + E2E contre le vrai binaire : `oc_analysis_v1` vérifiée `OCV1.`, rechargement pendant l'analyse, résultat retrouvé dans Aujourd'hui, Annuler non destructif, clé supprimée après fusion |
| P8-2 | Serveur MCP local (lecture limitée + propositions) | Écritures = propositions via aperçu | P7-2 | **terminée** | `oc-compagnon --mcp` (rmcp, stdio, coupé par défaut, autorisé/révoqué depuis la feuille du Compagnon) : 2 outils — résumé en liste blanche re-filtré par le cœur (5 tests Rust) et dépôt de proposition scellée (pid = hash, rejeu idempotent) qui repasse par l'aperçu multi-sélection (`oc_proposals_v1`, 4 tests unitaires). E2E `e2e-mcp.mjs` contre le vrai binaire au protocole réel : découverte (aucun outil d'écriture directe ni de suppression), lecture sans champ privé, hostiles refusées, survie au rechargement + kill du Compagnon, fusion sûre + Annuler, écart + retour, révocation immédiate — 390×844 sombre + 1280×800 clair, 3 exécutions |

Reportés (hors V1) : multi-profils UI, modèle Cadré visible, MCP distant/relais,
Yahoo/iCloud/Zoho/Proton, suivi d'ouvertures, portage Capacitor.
