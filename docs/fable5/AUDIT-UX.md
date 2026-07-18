# OpenContact — audit visuel UX/UI (v6.3.0)

> **Nature du document** : audit d'observation, **sans aucune modification de
> l'application**. Il liste ce qui va bien, les frictions repérées et un plan
> de correction priorisé. Aucune ligne de `engine/`, `ui/`, `styles/` ou du
> Compagnon n'a été touchée. À lire avec `UX-PLAN.md` (le plan validé) et
> `CLAUDE.md` (les invariants).

## 1. Méthode

- **Application lancée pour de vrai** : serveur statique local + Chromium
  (Playwright), pas une relecture de code.
- **Deux contextes** conformes à la règle « adaptatif, pas responsive »
  (CLAUDE.md §5) : **mobile 390 × 844** (tactile) et **ordinateur
  1440 × 900**.
- **Deux thèmes** (clair / sombre) sur les écrans où le sombre révèle une
  vraie différence.
- **Usage intensif simulé** : jeu de données fictif de **64 pistes** variées
  (10 domaines, 14 villes, statuts à contacter / en cours / réponse /
  clôturées, actions en retard / du jour / à venir, ~1 piste sur 5 sans
  e-mail, 2 contacts à rattacher), profil rempli, messagerie « connectée »
  sur la passe ordinateur. Aucune donnée réelle, aucun secret à l'écran.
- **60 captures** couvrant : accueil, Aujourd'hui (vide / peuplé / à jour),
  Mes pistes (liste, board, recherche, tri, aucun résultat), fiche, Moi,
  verrouillage (création, pavé, phrase, sauvegarde, gestion, écran
  verrouillé, erreur, récupération), Mes appareils (départ, relié, erreur
  réseau), Compagnon (ajout gaté, gestion, fenêtre desktop), Connexions
  (messagerie + IA), Écrire (connecté / non), campagne (Prospecter,
  bifurcation, message, contrôle, feuille du jour, envoi, choix
  manuel/Compagnon), analyse « Depuis mes e-mails » + aperçu multi-sélection,
  Échanger / Donner / Recevoir, états d'erreur et hors-ligne.
- **Zéro erreur console** dans tous les parcours normaux. Les seules erreurs
  observées sont les WebSocket des relais P2P **injoignables** (réseau du bac
  à sable) — utile : ça a montré la dégradation propre de « Mes appareils »
  (voir §5).

## 2. Verdict global

**L'application est cohérente, soignée et prête sur le fond.** Sur 60 écrans,
l'identité « Utilitaire 98 » tient sans faute (bevels francs, encre/teal,
Silkscreen/Plex/Public Sans, icônes pixel), le thème sombre est lisible
partout, les états vides enseignent au lieu de culpabiliser, et le parcours
« reçois → aperçu → fusion → Annuler » est identique quel que soit le canal.
Les parcours sensibles (verrou, récupération, appareils, Compagnon) sont
honnêtes et non punitifs.

Les frictions trouvées sont **ciblées et peu nombreuses** : une seule est un
vrai défaut fonctionnel (un bouton primaire mort), les autres sont des
questions de découvrabilité et de finition. Rien ne remet en cause
l'architecture ni les invariants.

## 3. Points forts vérifiés à l'écran

- **Cohérence visuelle totale** clair ↔ sombre, mobile ↔ ordinateur. Le board
  3 colonnes (À contacter / En cours / Réponse) sur desktop et la liste
  mobile sont deux réponses distinctes, pas un étirement (`m-04`, `d-02`).
- **États vides pédagogiques** : « Ta recherche, un jour à la fois »,
  « Tout est à jour », contacts à rattacher, etc. (`m-01`, `d-18`).
- **Contrôle de campagne exemplaire** : récap honnête (nombre, rythme
  15/j + fenêtre lun–ven 8-19 h, « s'arrête seule si on te répond »,
  adresse d'envoi, pistes sans e-mail écartées et **nommées**), dépliant
  « Voir les N emails remplis », découverte Compagnon au bon moment
  (`m-12`, `d-12`).
- **Sécurité claire et humaine** : pavé 6 chiffres, phrase numérotée
  « écris-la sur papier », sauvegarde chiffrée bloquante, écran verrouillé
  plein écran, « Ce n'est pas ça. », « Code oublié ? » → récupération
  (`m-23`→`m-26`, `m-37`→`m-39`).
- **Aperçu avant fusion + multi-sélection** pour l'analyse IA, cases cochées
  par défaut, « Rien n'est écrasé, annulable » (`d-17`).
- **Rappels de confidentialité au geste**, courts : « Seules les fiches
  partent — jamais ton suivi privé » (`m-19`), « OpenContact ne lira jamais
  ta boîte ».
- **Cibles conformes** là où ça compte : boutons d'action d'Aujourd'hui
  (44 px), pavé (44/48 px), navigation basse (44 px), boutons-icônes tri/thème
  (44 px).
- **Dégradation réseau propre** : relais P2P injoignables → « Mes appareils »
  reste en « en liaison », et Donner/Recevoir rappellent le repli `.oc`.

## 4. Frictions & correctifs (priorisés)

### P1 — à corriger : défaut fonctionnel

**F1. « Écrire » avec messagerie connectée + piste sans e-mail : le bouton
« Envoyer » primaire est mort (aucun retour).**
- **Constat** : quand une messagerie est connectée et qu'on ouvre « Écrire »
  sur une piste **sans adresse e-mail** (cas très courant — beaucoup de
  pistes ne sont qu'un nom), le pied affiche « Envoyer » en **bouton
  primaire vert**. Or `doSend()` fait `if (!ct || !ct.email) return;` : le
  clic **ne fait rien**, sans toast ni message. « Ouvrir dans Mail » est bien
  désactivé (grisé), mais « Envoyer » ne l'est pas — incohérent.
- **Où** : `ui/mail.js` — `doSend` (retour silencieux) et la construction du
  pied `[bCopy, aMail, bSend]` quand `acct` est vrai ; `bSend.disabled` n'est
  jamais lié à la présence d'e-mail.
- **Preuve** : capture `d-09-ecrire-connecte` (piste « Orange Cyberdefense »
  sans e-mail, « Envoyer » vert actif, « Ouvrir dans Mail » grisé).
- **Impact** : l'action principale de l'écran ne répond pas. Frustration,
  impression de bug. C'est le seul vrai « bouton qui ne marche pas » de l'app.
- **Correctif proposé** : quand le contact courant n'a pas d'e-mail, **ne pas
  proposer « Envoyer » en primaire** — désactiver `bSend` (`btn-off`) et
  repasser le primaire sur « Copier » / « Ouvrir dans Mail » comme dans le
  cas non connecté ; réévaluer à chaque `sync()` (changement de
  destinataire). Le hint « Pas d'email sur cette piste… » existe déjà, il
  suffit d'aligner le bouton dessus.
- **Parent proche** (même famille, moins grave car il donne un retour) : le
  contrôle de campagne affiche « Valider la campagne » en primaire même sans
  messagerie ni Compagnon ; le clic **toaste** « Connecte d'abord ta
  messagerie » (donc pas muet) mais oblige à sortir. Même remède : désactiver
  le primaire tant que l'envoi n'est pas possible et pointer le lien
  « Connecter » déjà présent. (`ui/campagnes.js`, `stepControl`.)

### P2 — découvrabilité / cohérence

**F2. Le Compagnon n'est pas associable depuis le téléphone, et deux indices
envoient le mobile dans une impasse.**
- **Constat** : « Ajouter le Compagnon » n'apparaît que sur **ordinateur**
  (`isDesktop()` dans `ui/direct.js`). C'est cohérent (on appaire depuis
  l'ordinateur où il est installé), mais :
  - « Depuis mes e-mails » (mobile, sans Compagnon) dit *« Avec le Compagnon,
    ton ordinateur fait la lecture tout seul — **Moi → Mes appareils** »*
    (`ui/recevoir.js`) — or sur téléphone, « Mes appareils » n'offre **aucune**
    entrée Compagnon → cul-de-sac.
  - Le seul point de découverte mobile est enfoui dans le contrôle de
    campagne (« voir comment »), conforme à UX-PLAN §7 mais peu visible.
- **Preuve** : `m-18-depuis-emails` (indice « Moi → Mes appareils ») vs
  `m-15-mes-appareils` (aucune ligne Compagnon sur mobile) vs
  `d-05-mes-appareils` (le lien n'existe que sur desktop).
- **Impact** : un utilisateur mobile suit l'indice et ne trouve rien — micro
  perte de confiance sur la fonctionnalité vitrine.
- **Correctif proposé** : sur mobile, **remplacer l'indice** par une phrase
  honnête (« Le Compagnon s'installe et s'associe **depuis ton ordinateur** —
  ouvre OpenContact là-bas ») ; ou ajouter dans « Mes appareils » (mobile) une
  ligne info non-cliquable « Le Compagnon » qui explique qu'on l'associe côté
  ordinateur. Aligner les deux copies sur UX-PLAN §7.

**F3. Les relais P2P « personnalisables » n'ont aucun point d'entrée dans
l'interface.**
- **Constat** : `oc_relays_v1` est **lu** (`ui/synclive.js`) mais jamais
  **écrit** par l'UI. CLAUDE.md §8 annonce pourtant des relais
  « personnalisables ». Sur un réseau bloqué (école, entreprise — exactement
  le public cible), **tous les relais échouent** (observé ici) et
  l'utilisateur n'a **aucun moyen** d'en ajouter un ; seul le fichier `.oc`
  fonctionne.
- **Où** : `ui/synclive.js` (lecture `RELAYS_KEY`), aucune écriture côté UI.
- **Impact** : fonctionnalité **accessible uniquement techniquement** (éditer
  IndexedDB à la main). Modéré : c'est une soupape pour réseau contraint, mais
  elle est invisible.
- **Correctif proposé** : ajouter une entrée discrète « Avancé — relais de
  connexion » (par ex. en pied de « Mes appareils », repliée) permettant de
  coller une liste d'URL `wss:` ; à défaut, rendre le repli `.oc` encore plus
  visible dans l'état d'erreur de liaison. (Aligner CLAUDE.md §8 si la
  personnalisation reste volontairement hors V1.)

### P3 — finition / système de design

**F4. Cibles tactiles sous 44 px : `.btn-sm` (36 px) et `.abtn-sm` (32 px).**
- **Constat** : la checklist CLAUDE.md §9 exige « ≥ 44 px mobile ». Sont
  conformes : `.abtn` (44), pavé (44/48), `.bottomnav a` (44), `.icon-btn`
  (44). **Ne le sont pas** : `.btn-sm` (36 px) et `.abtn-sm` (32 px), très
  utilisés sur mobile — « Rattacher », « Connecter / Déconnecter »,
  « Ajouter / Voir » des documents, « Prospecter », **« Envoyer » par ligne
  de la feuille du jour**, poubelle/crayon des prompts et orphelins.
- **Où** : `styles/app.css` — `.btn-sm{min-height:36px}` (l.145),
  `.abtn-sm{width:32px;height:32px}` (l.653).
- **Impact** : le geste quotidien clé (« Envoyer » d'une ligne de campagne)
  est à 36 px sur tactile — un peu petit. Les `.abtn-sm` (32 px) ont un repli
  au glissement, moins critique.
- **Correctif proposé** : passer `.btn-sm` à `min-height:44px` sous
  `(pointer:coarse)` (au minimum pour le « Envoyer » de la feuille du jour) ;
  élargir `.abtn-sm` à 40-44 px sur tactile.

**F5. Contact sans nom : l'e-mail s'affiche deux fois.**
- **Constat** : dans « Contacts à rattacher », un orphelin sans nom montre
  l'e-mail en **titre** (repli `ctLabel`) **et** en sous-ligne →
  « recrutement@exemple.fr / recrutement@exemple.fr ».
- **Où** : `ui/pistes.js` — `orphansHTML` (titre `ctLabel(o)`, sous-ligne
  `o.email || o.phone`).
- **Preuve** : `m-04-pistes-liste`, `d-02-board` (2e contact à rattacher).
- **Correctif proposé** : si le titre vaut déjà l'e-mail/le téléphone, ne pas
  le répéter en sous-ligne (montrer « à compléter » ou le seul indice
  « → entreprise ? »).

**F6. Petites finitions.**
- **Toast qui chevauche l'en-tête de feuille** : après validation d'une
  campagne, « Campagne prête ✓ » recouvre le haut de la feuille du jour
  (`d-14`, `d-16`). Cosmétique (position/z-order des barres transitoires vs
  modale).
- **Libellés IA un peu redondants** : « OpenAI (clé) — via ton ordinateur —
  bientôt », « Ollama (local) — via ton ordinateur — bientôt » mélangent le
  qualificatif entre parenthèses et la note de canal ; seules Gemini et Claude
  (« colle ta clé ») marchent aujourd'hui (`m-35`). Clarifier lesquelles sont
  actives maintenant.
- **Constante morte `VIEW_KEY` (`oc_view`)** : déclarée dans
  `engine/storage.js`, jamais utilisée. Ménage sans impact UX.
- **Écrans vides très aérés sur grand ordinateur** : « Tout est à jour » et
  les feuilles centrées laissent beaucoup de vide en 1440 px (`d-18`).
  Acceptable ; on pourrait équilibrer.

## 5. Accessibilité des fonctions codées → point d'entrée UI

Vérifié que chaque capacité présente dans le code a une porte d'entrée
compréhensible. **Une seule est absente** (relais, F3).

| Fonction (code) | Point d'entrée | Verdict |
|---|---|---|
| Verrouillage (coffre) | Moi → Verrouillage → Protéger | ✅ |
| Déverrouillage / auto-lock | Écran verrouillé plein écran | ✅ |
| Récupération d'urgence | Écran verrouillé → « Code oublié ? » | ✅ |
| Biométrie (PRF) | Proposée à la création + Verrouillage → gestion | ✅ (si dispo) |
| Sync « Mes appareils » | Moi → Mes appareils → Relier | ✅ |
| Commandes d'appareil (verrouiller/principal/retirer/bannir/effacer) | Mes appareils → tap ligne (appareil principal) | ✅ |
| Associer le Compagnon | Mes appareils (**desktop**) / campagne « voir comment » (mobile) | ⚠️ mobile ambigu (F2) |
| Gérer / rompre le Compagnon | Mes appareils → ligne Compagnon | ✅ |
| Connexions messagerie (Gmail/Outlook) | Moi → Connexions | ✅ |
| Connexions IA (clé navigateur / via ordinateur) | Connexions → Assistant | ✅ |
| Envoi direct | Écrire (messagerie connectée) | ⚠️ bouton mort sans e-mail (F1) |
| Brouillon IA | Écrire → « Proposer un brouillon » (si IA connectée) | ✅ |
| Campagne | Prospecter → « En campagne » | ✅ |
| Campagne auto (Compagnon envoie) | Contrôle → « Qui appuie sur Envoyer ? » (si Compagnon) | ✅ |
| Vécu quotidien campagne | Aujourd'hui → ligne groupée → feuille du jour | ✅ |
| Reprendre la main | Feuille du jour (campagne confiée) | ✅ |
| Détection des réponses | Auto (Compagnon) / marquage manuel sur la fiche | ✅ |
| Analyse « Depuis mes e-mails » | Échanger → Recevoir → Depuis mes e-mails | ✅ |
| Partage en groupe (promo) | Échanger → Salle de groupe | ✅ |
| Donner (QR / fichier) | Échanger → Donner | ✅ |
| Recevoir (scanner / fichier / coller) | Échanger → Recevoir | ✅ |
| CV & lettre (PDF) | Moi → CV & lettre | ✅ |
| Modèles d'e-mails | Moi → Modèles d'emails | ✅ |
| Prompts IA | Moi → Coup de pouce IA | ✅ |
| Sauvegarde / restauration `.oc` | Moi → Ma sauvegarde | ✅ |
| Tri multi-niveaux | Barre de tri (Mes pistes, Prospecter, Donner) | ✅ |
| Suppression au geste | Mes pistes (glisser / poubelle) | ✅ |
| **Relais P2P personnalisés** | **aucun** | ❌ (F3) |

## 6. Grille d'évaluation (critères demandés)

| Critère | Note | Commentaire |
|---|---|---|
| Compréhension immédiate | ★★★★★ | Titres, états vides et hints situent tout de suite. |
| Hiérarchie visuelle | ★★★★★ | Un primaire par vue, verbe d'action avant le nom, board net. |
| Cohérence des intitulés | ★★★★☆ | Excellente ; petites redondances (F5, libellés IA). |
| Découvrabilité | ★★★★☆ | Très bonne, sauf Compagnon sur mobile (F2) et relais (F3). |
| Nombre d'étapes | ★★★★★ | Une décision par feuille, deux taps par piste, tap = valide. |
| Adaptation mobile/ordinateur | ★★★★★ | Vraiment deux interfaces (liste vs board, pavé vs clavier). |
| Lisibilité / contrastes | ★★★★★ | Bon en clair ET sombre, encre via `currentColor`. |
| Zones tactiles | ★★★★☆ | Conformes sauf `.btn-sm`/`.abtn-sm` (F4). |
| Retours après action | ★★★★☆ | Toasts/Undo partout — sauf le bouton mort F1. |
| Erreurs & récupération | ★★★★★ | Aperçu + Annuler, repli `.oc`, verrou non punitif. |
| Cohérence PWA ↔ Compagnon | ★★★★☆ | Même identité et vocabulaire ; le pont mobile manque (F2). |

## 7. Plan de correction (ordre conseillé)

1. **F1 — bouton « Envoyer » mort** (`ui/mail.js`, effet miroir dans
   `ui/campagnes.js`). *Petit, à fort impact.* Désactiver le primaire quand
   l'envoi est impossible et re-basculer le repli.
2. **F2 — pont Compagnon sur mobile** (`ui/recevoir.js`, `ui/direct.js`).
   Copie honnête + éventuelle ligne info dans « Mes appareils » mobile.
3. **F4 — cibles tactiles** (`styles/app.css`). `.btn-sm` → 44 px sous
   `(pointer:coarse)`, au minimum pour « Envoyer » de la feuille du jour.
4. **F3 — relais personnalisables** (`ui/synclive.js` + une petite feuille),
   ou décision produit de rester hors V1 (et ajuster CLAUDE.md §8).
5. **F5 / F6 — finitions** : e-mail dupliqué, chevauchement toast/feuille,
   libellés IA, `VIEW_KEY` mort, respiration des vides desktop.

Aucun de ces points n'est bloquant pour une mise en main : F1 est le seul à
traiter en priorité pour ne pas laisser un bouton principal sans effet.

## 8. Suivi de correction — 18 juillet 2026

Le présent audit reste la photographie du constat initial. La reprise suivante
a traité les priorités sans redesign ni ajout de capacité IA :

| Point | État après correction | Preuve |
|---|---|---|
| F1 — action morte sans e-mail | corrigé : « Envoyer » est désactivé et « Copier » devient primaire ; même garde au contrôle de campagne | `e2e-ux-audit.mjs` |
| F2 — Compagnon ambigu sur téléphone | corrigé : copie explicite dans « Mes appareils » et « Depuis mes e-mails », sans bouton d'appairage local impossible | `e2e-ux-audit.mjs` en 390×844 |
| F3 — relais invisibles | corrigé : volet « Connexion avancée », `wss://` uniquement, huit adresses max, dédoublonnage et retour aux relais publics | stockage `oc_relays_v1` vérifié par E2E |
| F4 — cibles sous 44 px | corrigé pour `.btn-sm` et `.abtn-sm` en tactile/petit écran | dimensions calculées par E2E |
| F5 — contact dupliqué | corrigé : l'e-mail ou le téléphone n'est plus répété quand il sert déjà de titre | cas orphelin vérifié par E2E |
| F6 — finitions prioritaires | corrigé pour le toast de la feuille du jour et les libellés/disponibilités IA | parcours verrou + audit UX verts |

La constante morte `VIEW_KEY` et la respiration des grands écrans ne sont pas
des défauts prioritaires et restent à examiner avec le mainteneur pendant la
revue écran par écran. La validation après correction donne **79/79 tests
unitaires**, **10/10 scénarios réellement joués**, **3 scénarios natifs sautés
explicitement** faute de binaire Compagnon, et zéro erreur navigateur. Les
tests Rust natifs restent à refaire ici car `cargo` n'est pas installé.
