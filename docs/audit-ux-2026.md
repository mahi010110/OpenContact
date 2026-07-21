# OpenContact — audit UX/UI & direction de conception (2026-07)

> **Statut : diagnostic.** Ce document n'engage aucune refonte. Il établit une
> base vérifiée — dans le code, l'app réelle et les tests — avant de toucher
> profondément à l'expérience. Il se lit avec `CLAUDE.md` (qui fait autorité
> sur les règles) et `docs/refonte-brief.md` (la vision d'origine, dont l'app
> a aujourd'hui débordé).

## 0. Résumé exécutif

**Le socle est sain ; c'est l'architecture d'expérience qui a décroché.** La
qualité d'exécution est réelle : `?test` passe **91/91**, zéro erreur console,
thème clair et sombre corrects, cibles tactiles et pièges de focus en place,
moteur pur et testé. Le problème n'est **pas** esthétique ni technique.

Le problème est que **le produit a grossi bien au-delà des « 4 zones »
annoncées**, mais son architecture d'information est restée à 4 cases. La
promesse d'origine — « je fais quoi maintenant ? », *simplicité par
soustraction* — tient encore dans « Aujourd'hui », mais tout le reste (sync P2P
multi-appareils, anneau signé, effacement à distance, 6 familles d'IA,
2 messageries OAuth, campagnes, application Compagnon de bureau, analyse d'e-mails)
s'est **empilé derrière l'onglet « Moi »** et **s'infiltre dans les autres
écrans**. Résultat : un débutant voit une app claire ; dès qu'il gratte, il
tombe sur un panneau de contrôle d'expert, présenté au même niveau que
« remplir mon profil ».

Les trois axes de travail, par ordre d'impact :

1. **Re-répartir la complexité** : séparer *l'usage quotidien* (capturer, agir,
   échanger) de *la configuration/expertise* (sécurité, appareils, IA,
   Compagnon). Aujourd'hui tout cohabite dans « Moi » et déborde ailleurs.
2. **Finir l'adaptatif** : 3 zones sur 4 sont, sur desktop, la colonne mobile
   centrée dans du vide (`.page-inner` plafonné à 640 px). Seul « Mes pistes »
   exploite vraiment l'écran large. Desktop et mobile n'ont pas encore
   d'objectifs distincts, sauf sur un écran.
3. **Rendre honnête ce qui est montré** : plusieurs fonctions sont *visibles
   mais non utilisables sans une étape ou un appareil absent* (Connexions
   derrière un verrou obligatoire, « Depuis mes e-mails » qui suppose le
   Compagnon de bureau, Partage en groupe en bêta permanente).

---

## 1. Méthode & périmètre vérifié

- **Code lu** : `app.js`, `index.html`, les 27 modules `ui/`, les modules
  `engine/` structurants (`model.js`, `state.js`, `storage.js`, `filter.js`,
  `exchange.js`, `sync.js`, `ai.js`), `styles/app.css` + tokens.
- **App lancée réellement** (serveur statique + Chromium/Playwright) et
  capturée en **390×844 (tactile)** et **1280×800**, **thème clair et sombre**,
  avec des états **0 / 1 / 30 pistes**, **profil rempli et vide**. Écrans et
  feuilles ouverts : Aujourd'hui, Mes pistes (liste + tableau), Échanger,
  Moi, fiche, capture, Donner, Recevoir, Prospecter, Mes appareils, gate
  Connexions.
- **Tests** : `?test` → **91/91 verts**, **zéro erreur console** sur tous les
  parcours capturés.
- **Docs de référence relues** : `CLAUDE.md`, `refonte-brief.md`,
  `plan-v7.md`, `degraissage-v6.3.md`, `inspection-ux.md`, `revue-2026-07.md`.
  Les constats ci-dessous sont re-vérifiés dans l'app **actuelle**, pas
  hérités de l'ancienne doc.

Ce qui **va bien** et ne doit pas régresser (pour cadrer le reste) : l'état
vide d'Aujourd'hui (positif, pédagogique), la fiche-formulaire avec Confirmer
+ garde-fou, la capture éclair + anti-doublon, l'aperçu-avant-fusion partout,
le geste unique de suppression + Annuler, le contrôle de tri partagé, le
tableau 3 colonnes desktop, le thème sombre, la cohérence « 98 ».

---

## 2. Cartographie réelle : 4 zones annoncées, ~20 surfaces vécues

L'utilisateur navigue avec **4 entrées** (Aujourd'hui · Mes pistes · Échanger ·
Moi). Mais l'app expose en réalité, derrière elles :

| Zone | Ce qu'elle contient vraiment |
|---|---|
| **Aujourd'hui** | flux d'actions (En retard / Aujourd'hui / Bientôt) **+** puce « reçu de la promo » **+** puce « contacts à rattacher » **+** puce « analyse IA à trier » **+** puce « ton assistant propose » **+** lignes de campagnes en cours |
| **Mes pistes** | liste/tableau **+** Prospecter (candidatures en série + **campagnes** à relances) **+** filtre **+** tri multi-niveaux **+** bac « à rattacher » **+** clôturées |
| **Échanger** | Donner (QR-données / QR-rendez-vous **P2P** / fichier `.oc` chiffrable) **+** Recevoir (scan / fichier / coller / **« Depuis mes e-mails » IA**) **+** **Partage en groupe** (salle P2P live, bêta) |
| **Moi** | profil · modèles d'e-mails · CV/lettre PDF · sauvegarde/restauration · **Verrouillage** (PIN/biométrie) · **Mes appareils** (sync P2P, **anneau signé**, rôles, principal, **verrouiller/bannir/effacer à distance**, relais, **TURN**, **Compagnon**) · **Connexions** (Gmail/Outlook OAuth + **6 familles d'IA**) · Coup de pouce IA (prompts) · aide |

**Le déséquilibre est flagrant :** « Moi » n'est plus « mon profil », c'est le
**panneau de contrôle de tout le système** — identité *et* sécurité *et*
infrastructure P2P *et* comptes tiers *et* IA *et* application de bureau. Une
seule case de navigation porte 8 mondes, du plus anodin (mon prénom) au plus
pointu (rotation de clés d'un anneau d'appareils).

---

## 3. Les constats, classés par gravité

Échelle : 🔴 **structurel** (nuit à la compréhension ou à l'évolutivité) ·
🟠 **friction** (déroute ou ralentit) · 🟡 **finition** (polish).

### 🔴 C1 — « Moi » est un fourre-tout qui mélange usage et administration
**Constat.** Dans une même page centrée, empilés au même poids visuel :
« Remplir mon profil », « Télécharger ma sauvegarde », « Protéger »,
« Relier mes appareils », « Connecter ma messagerie », « Coup de pouce IA ».
La feuille « Mes appareils » va jusqu'à *verrouiller / bannir / effacer à
distance* un autre appareil et régler des serveurs **TURN** (`ui/direct.js`).
**Impact.** L'utilisateur ne sait pas ce qui est « pour tout le monde » (profil,
sauvegarde) et ce qui est « pour les avancés » (anneau, TURN, IA). La charge
mentale de la page est celle d'un panneau d'admin, alors que 90 % des visiteurs
n'y viennent que pour signer leurs e-mails.
**Cause.** Le modèle « 4 zones » de `refonte-brief.md` a été respecté à la
lettre alors que le périmètre a triplé. Faute d'une 5ᵉ maison, tout le neuf a
atterri dans « Moi », le seul tiroir « divers » disponible.

### 🔴 C2 — Adaptatif inachevé : 3 zones sur 4 sont du mobile centré
**Constat.** `styles/app.css:44` : `.page-inner{max-width:640px;margin:0 auto}`.
Aujourd'hui, Échanger et Moi sont donc, sur un écran de 1280 px, **la colonne
mobile posée au milieu**, avec ~320 px de vide de chaque côté (vérifié en
capture). Seul « Mes pistes » (`.page-wide`, `app.css:701`) devient un vrai
tableau 3 colonnes.
**Impact.** `CLAUDE.md §5` pose « **adaptatif, PAS responsive** » : deux
expériences pour deux moments. En pratique, **une seule** l'est. Sur desktop —
censé être le « poste de commandement » — « Aujourd'hui » n'offre rien de plus
que sur mobile ; l'espace ne sert ni à voir plus loin (semaine), ni à agir plus
vite (raccourcis, sélection multiple, aperçu latéral d'une fiche).
**Cause.** L'adaptatif a été traité écran par écran et s'est arrêté après
« Mes pistes ». Le breakpoint existe et fonctionne ; l'intention desktop n'a
simplement pas été conçue pour les 3 autres.

### 🔴 C3 — Fonctions visibles mais non accessibles au moment où on les voit
**Constat.**
- **Connexions** : dans « Moi », le bouton lit « Connecter » ; au clic, il
  n'ouvre pas la messagerie mais un mur « **Protéger d'abord** » (verrouillage
  obligatoire) — `ui/connexions.js:213`. On propose une action, on la refuse.
- **« Depuis mes e-mails »** (Recevoir) : présent **sur mobile**, mais le vrai
  mode automatique suppose le **Compagnon** installé sur un **ordinateur**
  (`ui/recevoir.js:171-205`). Le mobile voit une promesse qu'il doit aller
  réaliser ailleurs.
- **Partage en groupe** : marqué `bêta` en permanence (`ui/echanger.js:26`),
  donc présenté puis dévalorisé du même geste.
**Impact.** C'est le défaut nommé par le mainteneur (« fonctions visibles
alors qu'elles ne sont pas accessibles »). Chaque cas apprend à l'utilisateur
à se méfier de ce qu'il voit : le libellé ne dit pas la vérité du parcours.
**Cause.** Des pré-requis réels (sécurité des jetons, appareil de bureau) mais
**exposés après coup** plutôt qu'en amont : on montre la porte, puis on annonce
qu'elle est fermée.

### 🟠 C4 — Des besoins différents partagent le même écran
**Constat.**
- **Recevoir** mélange deux intentions sans rapport : *recevoir un partage d'un
  camarade* (scan/fichier/coller) et *faire lire mes propres e-mails par une
  IA* (« Depuis mes e-mails »). Ce sont deux histoires (l'autre m'envoie / je
  fouille chez moi), rangées côte à côte.
- **Aujourd'hui** superpose au flux d'actions jusqu'à **cinq bandeaux** de
  natures différentes (promo reçue, contacts à rattacher, analyse IA,
  propositions de l'assistant, campagnes) — `ui/today.js:104-109`. L'écran
  « fais ceci maintenant » devient aussi un centre de notifications.
**Impact.** La question « où je clique pour X ? » perd sa réponse évidente. Le
héros de chaque écran (une action claire) se dilue.
**Cause.** Chaque nouveauté a été rattachée à l'écran *thématiquement* le plus
proche (l'IA lit des e-mails → « Recevoir » ; tout ce qui « arrive » → une
puce sur Aujourd'hui), sans arbitrer la **charge** de l'écran d'accueil.

### 🟠 C5 — La complexité d'expert est exposée trop tôt, au même niveau que le simple
**Constat.** Sans aucune progression, l'utilisateur peut tomber sur : la
gestion d'un **anneau d'appareils signé** avec « en faire l'appareil
principal », « retirer et changer les clés », « effacer ses données à
distance » (`ui/direct.js:115-154`) ; le choix parmi **6 familles d'IA** avec
distinction clé-navigateur vs « via ton ordinateur » (`engine/ai.js`,
`ui/connexions.js:265`) ; des réglages **relais/TURN**. Tout cela est bien
fait et honnête — mais offert **d'emblée**.
**Impact.** Charge cognitive forte pour l'étudiant-cible (« BTS SIO, entre deux
cours »), qui n'a besoin au départ que de : capturer, écrire, relancer,
partager un fichier.
**Cause.** Absence de niveaux (essentiel / avancé). Le repli `<details>` est
utilisé ponctuellement (Coup de pouce IA, Connexion avancée) mais pas comme
principe d'architecture.

### 🟠 C6 — L'accompagnement s'arrête après la première piste
**Constat.** L'état vide d'Aujourd'hui est excellent (« Ta recherche, un jour à
la fois » + un seul geste). Mais **après** la 1ʳᵉ piste, rien ne guide vers les
gestes fondateurs qui rendent l'app utile : remplir le **profil** (sinon les
e-mails partent incomplets), poser une **prochaine action**, faire une
première **sauvegarde**. Le profil vide n'est signalé que passivement, dans
« Moi ».
**Impact.** Un utilisateur peut accumuler des pistes puis découvrir tardivement
que ses e-mails ne sont pas signés, ou perdre ses données faute d'avoir
sauvegardé (local-first = aucune reprise serveur).
**Cause.** L'onboarding a été pensé comme *un* écran vide, pas comme un *fil*
qui accompagne les 3–4 premiers gestes structurants.

### 🟡 C7 — Découvrabilité de « Prospecter » (fonction majeure, entrée mineure)
**Constat.** Prospecter (candidatures en série **et** campagnes à relances
automatiques) n'est atteignable que par un petit `btn-sm` dans l'en-tête de
« Mes pistes » (`ui/pistes.js:246`). C'est l'une des plus grosses valeurs du
produit, cachée derrière un bouton secondaire.
**Impact.** Sous-utilisation probable d'une fonctionnalité à fort levier.
**Cause.** Ajout tardif rattaché à l'écran liste, sans place dédiée.

### 🟡 C8 — Redondances et troncatures de finition
**Constat.** Dans la liste mobile des pistes, le statut est signalé **deux
fois** (pastille de couleur à gauche + étiquette texte à droite). Certaines
sous-lignes se tronquent encore (« … copie vers … » dans Prospecter,
`ui/prospect.js:48`) alors que `degraissage-v6.3.md` visait la fin des
troncatures. Rien de bloquant.
**Impact.** Bruit visuel léger, densité un cran au-dessus du nécessaire.
**Cause.** Empilement d'indices redondants ; largeur mobile serrée.

### 🟡 C9 — Accessibilité & clavier : bon socle, angles à couvrir
**Constat.** Bien : lien d'évitement, `aria-label` sur les boutons-icônes,
piège de focus + Échap dans les feuilles, raccourci « / », `role=radiogroup`
sur le statut, équivalents souris aux gestes tactiles. À surveiller : le
**glisser-déposer du tableau** desktop n'a pas d'équivalent clavier *depuis le
tableau* (le contournement existe — ouvrir la fiche et changer le statut — mais
il n'est pas signalé) ; l'ordre de lecture des multiples puces d'Aujourd'hui
n'est pas hiérarchisé pour un lecteur d'écran ; à vérifier systématiquement :
focus visible sur fond sombre et contraste des textes « effacés »
(`--text-muted`) sur les deux thèmes.
**Impact.** Utilisable au clavier dans l'ensemble ; quelques parcours avancés
restent souris-first.
**Cause.** Priorité (légitime) donnée au tactile ; le clavier a suivi sans être
audité de bout en bout.

---

## 4. Mobile vs Desktop : deux objectifs, pas deux largeurs

`CLAUDE.md` le pose déjà : **le mobile mène avec la capture et l'action ; le
desktop mène avec la gestion.** L'app n'honore cette distinction que sur « Mes
pistes ». Direction à tenir :

| | **Mobile (< 901 px) — le terrain** | **Desktop (≥ 901 px) — le poste de commandement** |
|---|---|---|
| **But premier** | « je fais quoi *maintenant* ? » : capturer une piste croisée, écrire/relancer, échanger en personne (QR) | piloter la recherche : trier, filtrer, avancer plusieurs pistes, saisie longue, campagnes |
| **Aujourd'hui** | flux vertical, un geste par ligne, focus sur le dû | même flux **+** vue plus large : semaine à venir visible, aperçu d'une fiche en panneau latéral (pas une feuille plein écran), actions clavier |
| **Mes pistes** | liste cherchable | tableau 3 colonnes (déjà là) — **la référence** de ce que « adaptatif » veut dire |
| **Échanger** | **QR d'abord** (en personne), fichier ensuite | **fichier d'abord** ; le desktop montre un **QR à faire scanner par le téléphone** (pont sans serveur) |
| **Config avancée** | accessible mais **repliée** ; les gestes qui *exigent* un ordinateur (Compagnon) sont *décrits*, pas *offerts comme faisables ici* | c'est **ici** que vivent naturellement le Compagnon, les réglages relais/TURN, la gestion fine de l'anneau |
| **Saisie** | courte, 16 px, un pouce | longue confortable, raccourcis, tab entre champs |

**Principe :** ne jamais *étirer* un écran mobile pour remplir le desktop.
Quand le desktop n'a rien de plus à offrir qu'une colonne, **utiliser la
largeur pour montrer plus de contexte** (semaine, fiche en regard), pas pour
centrer du vide.

---

## 5. Principes UX/UI à adopter (la boussole du chantier)

1. **Deux mondes séparés : *faire* vs *régler*.** L'usage quotidien (capturer,
   agir, échanger) ne doit jamais partager le même plan que la configuration
   (sécurité, appareils, IA, Compagnon). C'est la décision structurante n°1.
2. **Progressive disclosure par défaut.** L'essentiel visible, l'avancé replié
   et nommé. Le `<details>` devient un *principe d'IA*, pas un pansement.
3. **Un écran = une intention = un héros.** Si un écran répond à deux besoins
   sans lien (Recevoir : camarade vs IA-mails), les séparer.
4. **Ne montrer que ce qui est faisable ici et maintenant.** Un pré-requis
   (verrou, appareil de bureau) s'annonce *avant* l'action, ou l'action n'est
   pas proposée sur ce contexte. Fini « Connecter → en fait non ».
5. **Adaptatif = intention par contexte.** Concevoir *deux réponses* quand les
   usages diffèrent ; sur desktop, la largeur sert le contexte, jamais le vide.
6. **Accompagner les 4 premiers gestes, pas seulement le premier.** Capturer →
   prochaine action → profil → sauvegarde, guidés sans culpabiliser.
7. **Garder l'ADN intact.** Local-first, « 98 », privé jamais partagé, jamais
   d'écrasement + Annuler, mono-domaine, zéro dépendance réseau au démarrage.
   Aucune de ces règles n'est en cause ici — la refonte est **d'architecture**,
   pas de moteur ni de peau.

---

## 6. Parcours à simplifier (concrets)

- **Recevoir → scinder.** « Recevoir d'un camarade » (scan / fichier / coller)
  reste dans Échanger. « Depuis mes e-mails » (IA) part vers le monde IA
  (voir §7) et se rappelle contextuellement quand c'est pertinent.
- **Aujourd'hui → dégraisser les bandeaux.** Garder au plus **un** rappel
  entrant à la fois, priorisé (le plus actionnable), les autres regroupés sous
  une seule entrée discrète « À trier (N) ». L'écran redevient « fais ceci ».
- **Moi → éclater** en *Profil & données* (léger, pour tous) et *Réglages
  avancés* (sécurité, appareils, IA, Compagnon, relais/TURN). Voir §7.
- **Connexions → lever le mur.** Soit intégrer la protection **dans** le
  parcours de connexion (« pour connecter ta messagerie, on protège d'abord —
  1 min »), soit n'afficher « Connecter » qu'une fois protégé. Ne plus proposer
  puis refuser.
- **Prospecter → sortir de l'ombre.** Lui donner une entrée assumée dans la
  zone « gestion » (desktop surtout), pas un `btn-sm`.
- **Fiche → RAS** (déjà bonne) : ne pas la réalourdir en y ramenant de la config.

---

## 7. Fonctionnalités à déplacer, masquer ou mieux accompagner

| Fonction | Aujourd'hui | Recommandation |
|---|---|---|
| **Mes appareils** (sync P2P, anneau, TURN, effacement distant) | dans « Moi », plein poids | → zone **Réglages avancés**. Sur mobile : état + un bouton (Relié/Non relié) ; le détail (rôles, TURN, bannissement) replié |
| **Connexions** (messagerie + 6 IA) | dans « Moi », derrière un mur | → **Réglages avancés** ; intégrer la protection dans le flux, pas après |
| **Compagnon** (app de bureau) | lien dans la feuille appareils | → **desktop** clairement ; sur mobile, seulement *expliqué* (« s'installe sur ton ordinateur »), jamais offert comme faisable ici |
| **« Depuis mes e-mails »** (IA) | option de « Recevoir » | → regrouper avec les autres capacités IA ; se **rappeler contextuellement** (chip « analyse prête » sur Aujourd'hui) plutôt que d'occuper un menu d'échange |
| **Partage en groupe** (P2P live) | bêta permanente dans Échanger | trancher : soit **assumé** (retirer « bêta », soigner l'entrée), soit **rangé** comme option avancée d'Échanger. Ne pas laisser en demi-teinte |
| **Coup de pouce IA** (prompts) | replié dans « Moi » | OK replié ; le rapprocher du reste de l'IA quand la zone IA existera |
| **Campagnes** | via Prospecter + puces Aujourd'hui | garder ; clarifier que c'est le pendant « série + relances » de la prospection ; entrée gestion assumée |
| **Prospecter** | `btn-sm` de Mes pistes | entrée dédiée dans la zone gestion (desktop) |
| **Sauvegarde/Restauration** | dans « Moi » | reste **léger et pour tous** (c'est un filet de sécurité) — à ne PAS enterrer sous l'avancé ; à **promouvoir** dans l'onboarding |
| **Verrouillage** | dans « Moi » | transverse : reste accessible, mais sa mise en place se déclenche *au moment utile* (première connexion messagerie) plutôt qu'en réglage isolé |

---

## 8. Un cadre pour intégrer les futures fonctionnalités

Le vrai livrable de cet audit n'est pas une liste de correctifs, c'est une
**grille de décision** pour que le produit puisse encore grandir sans se
brouiller. Avant d'ajouter quoi que ce soit, répondre à :

1. **Quotidien ou configuration ?** Si ça se fait « chaque jour » → dans le
   flux (Aujourd'hui / Pistes / Échanger). Si ça se règle « une fois » →
   Réglages. **Ne jamais mélanger les deux sur un écran.**
2. **Essentiel ou avancé ?** Essentiel = visible. Avancé = replié et nommé.
   Par défaut, **replié**.
3. **Faisable dans ce contexte ?** Si la fonction exige un appareil/pré-requis
   absent (Compagnon de bureau, verrou), elle est *décrite* là où on la
   découvre et *offerte* seulement là où elle marche.
4. **Quel écran, quel héros ?** Une fonction rejoint un écran seulement si elle
   sert **son** intention. Sinon, elle a besoin de sa propre maison, pas d'un
   coin d'un écran voisin.

**Piste d'architecture cible (à valider, pas encore à coder) :** faire évoluer
les 4 zones vers **« faire »** (Aujourd'hui · Mes pistes · Échanger) **+ un
espace « Réglages »** distinct, où « Moi » redevient *profil & données* (léger)
et où sécurité / appareils / IA / Compagnon vivent groupés et repliés. Une
éventuelle **zone IA** unifiée (connexions IA + prompts + analyse d'e-mails +
propositions) pourrait y résoudre l'éparpillement actuel de l'IA sur 3 écrans.

---

## 9. Ordre de priorité pour la refonte

Rappel : **on ne refond pas encore.** Voici l'ordre recommandé quand le
chantier s'ouvrira, du plus structurant au plus cosmétique.

### P0 — Décisions d'architecture (à trancher avec le mainteneur avant tout code)
- **Séparer « faire » et « régler ».** Sortir sécurité / appareils / IA /
  Compagnon de « Moi ». *(adresse C1, C5)*
- **Définir l'intention desktop** des 3 zones aujourd'hui centrées (au minimum
  Aujourd'hui : semaine visible + fiche en panneau latéral). *(C2)*
- **Choisir le sort du Partage en groupe** (assumé ou avancé) et du niveau de
  visibilité de l'IA. *(C3, C7)*

### P1 — Ré-architecturer sans rien couper
- Éclater « Moi » en *Profil & données* / *Réglages avancés* (repli par
  défaut de l'avancé). *(C1, C5)*
- Scinder « Recevoir » (camarade) de « Depuis mes e-mails » (IA). *(C4)*
- Dégraisser les bandeaux d'Aujourd'hui (un rappel prioritaire + « À trier »).
  *(C4)*
- Lever le mur Connexions (protection intégrée au flux). *(C3)*
- Concevoir l'**adaptatif desktop** d'Aujourd'hui et d'Échanger (largeur =
  contexte, pont QR desktop→mobile). *(C2)*

### P2 — Accompagnement & finitions
- Fil d'onboarding sur les 4 premiers gestes (piste → action → profil →
  sauvegarde), sans culpabiliser. *(C6)*
- Entrée assumée pour Prospecter/Campagnes côté gestion. *(C7)*
- Passe finition : redondances (statut ×2), troncatures restantes, densité.
  *(C8)*
- Passe accessibilité clavier de bout en bout (tableau, ordre des puces, focus
  sombre, contraste des textes effacés). *(C9)*

### Invariant de méthode (repris de `CLAUDE.md §9`)
Chaque livraison : **vérifiée en lançant réellement l'app** (390 + 1280, clair
+ sombre, `?test` vert + nouveaux tests si le moteur bouge), `CONTRAT.md` et
`sw.js` suivis si besoin, aucune fonctionnalité coupée, aucun invariant du
moteur cassé. Montrer la liste priorisée **avant** de coder les gros morceaux,
pour arbitrer ensemble.

---

*Fin du diagnostic. Prochaine étape suggérée : valider les décisions P0 avec le
mainteneur, puis n'ouvrir le chantier qu'écran par écran, mobile d'abord.*
