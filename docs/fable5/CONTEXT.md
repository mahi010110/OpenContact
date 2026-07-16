# Fable 5 — contexte stable du chantier « coffre, Compagnon, prospection, IA »

Document de continuité entre discussions. Il ne recopie pas les conversations :
il fixe la vision, les décisions **acquises** et les conventions de reprise.
Il n'évolue que lorsqu'une décision durable change.

## Vision

OpenContact reste un outil de **motivation et d'action** (voir `CLAUDE.md`,
qui fait autorité). Le chantier en cours ajoute, sans casser l'existant :

1. un **profil protégé** optionnel (coffre chiffré, PIN, phrase de secours) ;
2. « Mes appareils » enrichi d'un **appareil principal** (autorité, révocation,
   récupération) ;
3. le **Compagnon** : composant local facultatif (Tauri) pour les campagnes
   app fermée, IMAP/SMTP, IA locales/abonnements, MCP local ;
4. l'**envoi direct** d'emails (Gmail, Outlook d'abord) et des **campagnes
   fixes** prescriptives ;
5. la **rédaction et l'analyse par IA** (3 familles : locale, clé API,
   abonnement via runtime officiel) ;
6. « **Analyser mes e-mails** » orchestré localement (jamais via le connecteur
   Gmail d'un compte ChatGPT/Claude grand public) ;
7. **MCP local** en option avancée (l'IA lit et *propose*, l'aperçu décide).

## Contraintes non négociables

Celles de `CLAUDE.md` et `CONTRAT.md`, plus, pour ce chantier :

- l'app de base reste pleinement utile **sans** profil protégé, messagerie,
  IA ni Compagnon ; `mailto:` reste un repli permanent ;
- toute donnée entrante (IA comprise) passe par `parseInput` → normalisation
  → **aperçu avant fusion** (`mergePreviewInto`) ; aucune écriture directe,
  aucune suppression exposée à une IA ;
- aucun serveur permanent, aucun compte OpenContact, aucune analytics ;
- le mainteneur ne paie jamais l'usage IA/messagerie des utilisateurs ;
- secrets (jetons, clés, phrases) jamais en clair dans le stockage.

## Décisions acquises (ne pas re-demander)

| # | Décision |
|---|---|
| D1 | Terme visible : **« appareil principal »** (« Roi » = interne seulement) |
| D2 | Direction UX : **navigation actuelle conservée**, pas de nouvel onglet en V1 ; « Prospecter » = point de départ des campagnes ; « Aujourd'hui » montre les actions/états au bon moment ; « Moi » accueille connexions et réglages ; **préparer par défaut, l'utilisateur décide** ; automatisation par campagne via Compagnon |
| D3 | Campagne V1 = modèle **Fixe** : 1 message + 2 relances (J+7, J+14), 15 envois/jour max, fenêtre raisonnable imposée, **arrêt sur réponse non débrayable**, mention d'opposition imposée, aucun constructeur. Modèle « Cadré » prévu au moteur, **invisible en V1** |
| D4 | PWA↔Compagnon : **local + P2P**, choix automatique, jamais de jargon (« localhost », « P2P ») à l'écran ; le Compagnon apparaît **une fois** dans « Mes appareils » ; missions idempotentes (jamais exécutées deux fois) |
| D5 | IA : ① abonnement ChatGPT via **Codex App Server** dès la V1 ; ② abonnement Claude **seulement si** compatibilité tierce confirmée par doc officielle durable ; ③ Ollama + clés API (OpenAI, Anthropic, Gemini, OpenRouter). Sans IA, tout fonctionne |
| D6 | Verrouillage auto : **5 min mobile / 15 min ordinateur**, aucun réglage V1 ; même PIN sur tous les appareils du profil ; biométrie/passkey = accélérateur optionnel ; le verrouillage n'interrompt pas une campagne validée |
| D7 | Récupération d'urgence : ancien principal révoqué, protection + phrase renouvelées, **nouvelle sauvegarde chiffrée obligatoire** avant la fin du parcours ; honnêteté sur les anciennes copies |
| D8 | Lecture Gmail par le Compagnon : **mot de passe d'application** en parcours principal (trousseau OS uniquement) + **OAuth personnel** en option avancée ; jamais le mot de passe Gmail habituel |
| D9 | Profil protégé optionnel mais **requis** pour : messagerie, IA/clé API, Compagnon, campagnes automatiques ; 1 profil visible en V1, architecture multi-profils prête |
| D10 | Suivi d'ouvertures : **absent de la V1** ; étude ultérieure comme option facultative auto-hébergeable |
| D11 | Phrase d'association (appairage, existante) ≠ **phrase de secours** (récupération, forte) : deux objets distincts |
| D12 | MCP distant / relais : **reportés** ; MCP local d'abord ; tout relais futur = optionnel, auto-hébergeable, sans stockage permanent |

## Références dans le dépôt

- `CLAUDE.md` — référence produit & UI/UX (autorité).
- `CONTRAT.md` — contrat de données exécutable (`?test`).
- `docs/refonte-brief.md`, `docs/degraissage-v6.3.md`, `docs/plan-v7.md` —
  histoire et feuille de route générale.
- `docs/fable5/SPECIFICATIONS.md` — périmètre fonctionnel et technique
  consolidé du chantier, comportements, limites et critères d'acceptation.
- `docs/fable5/PLAN.md` — feuille de route opérationnelle du chantier.
- `docs/fable5/HANDOFF.md` — point de reprise courant.
- Les études détaillées (faisabilité v1/v2 du 2026-07, plan UX) ont été
  livrées **en discussion** ; la direction UX choisie sera consignée ici
  (section « Décisions acquises ») dès l'arbitrage du mainteneur. Les
  éléments durables (modèle de clés, phases techniques) sont résumés dans
  `PLAN.md`.

## Conventions de reprise

- Branche de travail : `claude/opencontact-repo-study-3bw0ju` (ne pas pousser
  ailleurs sans accord).
- Démarrage d'une discussion : lire `CLAUDE.md`, `CONTRAT.md`, `CONTEXT.md`,
  `SPECIFICATIONS.md`, `PLAN.md` et `HANDOFF.md`, puis `git status`/`git log` ;
  le dépôt et les tests font foi ; reprendre à « prochaine action exacte » de
  `HANDOFF.md`.
- Après chaque tâche : tests proportionnés, mise à jour `PLAN.md` +
  `HANDOFF.md`, commit petit et descriptif en français.
- `?test` doit rester 100 % vert ; toute évolution du contrat = `CONTRAT.md`
  + `tests.js` dans le même geste ; fichier précaché modifié = bump `sw.js`.
- Jamais de secret réel dans ces documents.
