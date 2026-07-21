# OpenContact — zoom UX sur les nouveautés intégrées (2026-07)

> Complément du diagnostic `docs/audit-ux-2026.md`. Ici on regarde **de
> près**, écran par écran, les fonctions ajoutées après la refonte à 4 zones —
> celles que le mainteneur veut « belles, faciles, compréhensibles » : **tri &
> filtres · campagnes · synchronisation · Compagnon · la page « Moi »**.
> Chaque constat a été **observé dans l'app lancée** (390 px et 1280 px, clair
> et sombre, données réalistes) puis recroisé dans le code. Références
> `fichier:ligne` à l'appui. On ne refond pas ici : on établit la direction.

Renvois vers les constats structurels du diagnostic : **C1** (« Moi »
fourre-tout), **C2** (adaptatif inachevé), **C3** (visible ≠ accessible),
**C4** (besoins mélangés), **C5** (expertise exposée trop tôt).

---

## A. Tri & filtres — un moteur de requêtes là où il faut deux boutons

### Ce qui a été observé
La barre de « Mes pistes » aligne, après le champ de recherche, **trois
boutons-icônes muets côte à côte** : entonnoir (Filtrer), ↕ (Trier), ↓ (sens)
— `ui/pistes.js:248-253`, `ui/sort.js:42-53`. À 390 px, la recherche est
tassée et rien ne dit ce que font ces trois icônes avant de les taper.

La feuille **Trier** n'est pas un simple choix de critère : c'est un
**constructeur de tri multi-niveaux** (`ui/sort.js:82-129`). On y empile un
critère principal **« puis par »** un départage, **« puis par »** un troisième,
chacun avec **sa propre bascule de sens** et **sa croix de retrait**. Observé
en deux niveaux : `1 Complètes ↓ ✕` / `2 À faire ↑ ✕` + une liste « Puis par ».

La feuille **Filtrer** fonctionne, elle, par **puces à bascule** (Statut +
Domaine) — `ui/pistes.js:175-199`. Deux grammaires différentes pour deux
boutons voisins, alors que `plan-v7.md` visait « la même grammaire que le tri ».

### Impact
- **Charge cognitive disproportionnée** pour le public visé (étudiant, mobile,
  entre deux cours). Un tri à départages est une fonction de tableur ; ici
  c'est le contrôle *par défaut* de la liste principale.
- **Redondance qui trouble** : le sens du critère principal se règle à **deux
  endroits** — le bouton ↓ de la barre *et* la flèche du niveau 1 dans la
  feuille (`ui/sort.js:51` vs `:92`). Deux commandes pour un même effet.
- **Icônes ambiguës** : ↓ pour « Récentes » signifie « plus récentes d'abord »,
  mais se lit spontanément « ordre décroissant/A→Z ». Sans libellé, on devine.
- **État courant peu lisible** : une fois la feuille fermée, seul un léger
  virage teal du bouton (`sort-on`) signale qu'un tri/filtre est actif. Sur une
  icône de 32-44 px, c'est presque invisible.

### Cause
Le moteur (`engine/filter.js`) sait faire le tri multi-niveaux ; l'UI a
**exposé toute la puissance du moteur** au lieu d'en montrer la part utile.
Le besoin réel (« montre-moi les À contacter », « les plus complètes d'abord »)
est noyé dans un builder générique.

### Direction proposée
- **Réduire à l'essentiel visible** : un seul contrôle « Trier » proposant 4-5
  critères en liste simple (tap = applique + referme), le sens intégré au
  critère quand il est évident (« Plus récentes », « À faire en premier »,
  « A → Z »). Le **multi-niveaux passe en avancé** (replié), pas au premier plan.
- **Un seul point de réglage du sens** (supprimer la redondance barre/feuille).
- **Fusionner l'intention** : sur mobile, une seule entrée « Trier / filtrer »
  qui ouvre une feuille unique (chips de filtre **et** choix de tri, même
  grammaire) plutôt que deux boutons muets.
- **Rendre l'état lisible** : quand un filtre/tri est actif, l'écrire en toutes
  lettres près de la liste (« À contacter · triées par complétude — tout
  montrer »), comme le fait déjà le `title` mais visible.
- **Desktop** : le tableau segmentant déjà le statut, n'y garder que le
  filtre Domaine + un tri de colonne — pas le builder.

---

## B. Campagnes — une fonction puissante sans maison ni repères

### Ce qui a été observé
Les campagnes n'ont **aucun écran à elles** (`ui/campagnes.js:1-10` l'assume).
On y entre par **Prospecter → « En campagne »**, et une campagne créée ne vit
plus que sous forme d'**une ligne dans « Aujourd'hui »** — placée **tout en
haut, au-dessus de « En retard »** (observé), et **tronquée** (« Prospection —
juillet … · Voir »).

Cette ligne **disparaît** quand la campagne n'a rien de dû aujourd'hui et pas
de réponse non vue (`campaignLines()`, `ui/campagnes.js:243-267`) : une
campagne active mais « au repos » entre deux relances **devient invisible** —
plus aucun point d'entrée pour la voir, la mettre en pause ou l'arrêter jusqu'à
la prochaine échéance.

Le wizard est par ailleurs soigné, mais deux frictions ressortent :
- **Pistes sans email écartées en masse.** En cochant « les 10 À contacter »,
  l'écran de vérification annonce « **5 pistes sans email — écartées** »
  (`ui/campagnes.js:368`). La moitié de la sélection ne part pas : le concept
  « candidatures en série » se heurte au fait que beaucoup de pistes jeunes
  n'ont pas encore d'email.
- **Variables brutes dans le composeur.** Le message affiche `{{contact}}`,
  `{{formation}}`, `{{entreprise}}` sans légende à cet endroit
  (`ui/campagnes.js:311`). Compréhensible pour un initié, opaque au premier
  contact.
- **Le Compagnon est vendu ici même** (« Ton ordinateur peut envoyer même app
  fermée — voir comment », `ui/campagnes.js:371`) : une nouveauté avancée
  insérée au milieu d'un flux déjà dense.

### Impact
- **« Où est passée ma campagne ? »** — le défaut de home crée une perte de
  contrôle : impossible de retrouver de façon fiable une campagne en cours.
- **Le rappel de campagne vole la vedette** au travail du jour en se posant
  au-dessus de « En retard », contre l'esprit « Aujourd'hui = fais ceci ».
- **Sélection trompeuse** : on croit lancer 10 candidatures, 5 partent.
- Charge et jargon (`{{}}`, Compagnon) au mauvais moment.

### Cause
Décision produit assumée (`ui/campagnes.js:1-10` : « pas d'écran campagnes ») —
mais elle tient tant qu'il y a **peu** de campagnes et qu'on les regarde le
jour même. Dès qu'une campagne dure (3 messages sur 14 jours), l'absence de
lieu se paie.

### Direction proposée
- **Donner une adresse aux campagnes** : une entrée « Campagnes (N) » dans la
  zone gestion (là où vit Prospecter), listant les campagnes vivantes avec leur
  état — même si rien n'est dû aujourd'hui. La ligne d'Aujourd'hui reste, mais
  comme **rappel d'action du jour**, pas comme seul point d'accès.
- **Dégrader le rappel dans Aujourd'hui** : sous les actions dues, jamais
  au-dessus ; non tronqué (le verbe d'abord).
- **Traiter les pistes sans email en amont** : à l'étape de sélection, séparer
  visiblement « prêtes à envoyer » / « manque un email » (proposer « ajouter un
  email » ou basculer en « copie vers LinkedIn »), au lieu d'un écartement
  annoncé à la fin.
- **Expliquer `{{ }}` sur place** (une puce discrète « les [variables] se
  remplissent toutes seules »).
- **Sortir le Compagnon du wizard** : le proposer depuis la zone gestion, pas
  au milieu de la validation.

---

## C. Synchronisation « Mes appareils » — propre en surface, machinerie lourde juste dessous

### Ce qui a été observé
La feuille reliée est **bien tenue** (post-corrections Fable 5) : la phrase, le
statut honnête (« Connexion aux relais… », observé — les relais publics sont
injoignables ici, l'app le **dit** au lieu de mentir), la liste « Appareils
reliés » (cet appareil + les autres, avec retrait), « Connexion avancée »
repliée, « Changer la phrase », « Rompre le lien » (`ui/direct.js:199-283`).

Mais **juste sous la surface** vit une infrastructure d'expert :
- **Réglages relais WebSocket + serveur TURN avec identifiants** dans
  « Connexion avancée » (`ui/direct.js:40-52`) — du réseau bas niveau dans une
  app grand public (heureusement replié).
- **Commandes d'un appareil à distance** — « verrouiller », « en faire le
  principal », « retirer et changer les clés », « **effacer ses données** »
  (`ui/direct.js:115-154`) : gestion d'un **anneau signé** avec rôles et
  révocation. C'est de l'administration de flotte.
- La **phrase de liaison est affichée en clair** en permanence
  (`ui/direct.js:210`) alors qu'elle donne accès à **tout le privé** de tous
  les appareils — un coup d'œil par-dessus l'épaule suffit à la lire.

### Impact
- Pour l'usage courant (relier téléphone + PC), c'est **plus que correct**.
- Mais l'écart entre « une phrase et c'est relié » et « bannir un appareil,
  changer les clés, régler un TURN » est **vertigineux** : deux publics très
  différents partagent la même feuille (**C5**).
- La phrase en clair est une petite exposition inutile la plupart du temps.

### Cause
La feuille a bien été **allégée** en façade, mais elle reste **le seul lieu**
de tout le P2P : gestion quotidienne et administration de sécurité empilées.

### Direction proposée
- **Deux étages nets** : « relier / voir mes appareils » (quotidien, visible)
  et « sécurité avancée » (TURN, effacement distant, changement de clés)
  replié et prévenu. C'est déjà à moitié fait (Connexion avancée) — l'étendre
  à la gestion fine des appareils.
- **Masquer la phrase par défaut**, révélée d'un tap (« Afficher la phrase »)
  au moment de relier un nouvel appareil.
- **Nommer clairement les gestes lourds** et les réserver au poste desktop
  (poste de commandement), pas au téléphone glissé dans une poche.

---

## D. Le Compagnon — bien expliqué, mais posé sur une pile de fenêtres

### Ce qui a été observé
Le discours est bon : mêmes trois raisons partout (`ui/compagnon.js:22-27`),
honnêteté sur l'installation (« depuis ton ordinateur »), avertissements OS au
moment du geste (`ui/compagnon.js:32-36`), feuille téléphone claire avec
« Copier le lien de téléchargement » (observée).

**Mais deux problèmes d'intégration ressortent :**
1. **Double fenêtre modale sur desktop** (observé, capture `comp-d-01`). Depuis
   « Mes appareils », cliquer « Ajouter le Compagnon » ouvre une **seconde
   fenêtre centrée par-dessus la première**, encore visible derrière. C'est le
   motif `openSheet`-sur-`openSheet` (`ui/dom.js:84-186`, pile de `overlay`) :
   sur mobile, des bottom-sheets qui se recouvrent passent ; sur desktop, deux
   barres de titre empilées font désordre — **en contradiction directe avec la
   règle « jamais deux surfaces modales à la fois »** posée dans
   `degraissage-v6.3.md`. Ce motif se répète partout où une feuille en ouvre
   une autre : `confirmSheet` sur une feuille, `openDeviceSheet`,
   `openCompanionSheet`, `openAiSheet` (Connexions), l'aperçu « Reçu en direct »
   sur le Partage en groupe…
2. **Fonction montrée avant d'être atteignable** (**C3**). « Ajouter le
   Compagnon » ouvre… un mur « **protège d'abord tes données** »
   (`ui/compagnon.js:84-90`) — puis, plus loin, il faut être **l'appareil
   principal** (`ui/compagnon.js:91-96`). Deux barrières découvertes *après* le
   clic, chacune dans sa propre fenêtre.

### Impact
- Le double-modal donne une impression de **couches qui s'empilent**, à
  rebours du « net, honnête » de l'identité 98.
- Le parcours d'association enchaîne les gates (protéger → principal → installer
  → coder) : beaucoup d'étapes pour une fonction déjà réservée aux avancés.

### Cause
`openSheet` **empile** par conception (utile pour les feuilles à étapes), mais
rien ne distingue « feuille enfant » (devrait remplacer/pousser le contenu) de
« nouvelle fenêtre » sur desktop. Les pré-requis (verrou, principal) sont
vérifiés **au clic**, pas signalés en amont.

### Direction proposée
- **Une seule surface modale à la fois sur desktop** : quand une feuille en
  ouvre une autre, remplacer le contenu (navigation interne) ou empiler
  *visiblement une seule* fenêtre (masquer la précédente). À traiter dans
  `dom.js` — gain transverse (touche Compagnon, Connexions, appareils, aperçus).
- **Annoncer les pré-requis avant le clic** : si non protégé / non principal,
  l'entrée « Ajouter le Compagnon » le dit d'emblée (état grisé + raison), ou
  intègre l'étape « protéger » dans un parcours continu, sans fenêtre-mur.
- Le Compagnon étant intrinsèquement **desktop**, en faire une entrée assumée
  du poste desktop plutôt qu'un lien niché dans une feuille mobile.

---

## E. « Moi » — à repenser : séparer *qui je suis* de *comment je règle le système*

### Ce qui a été observé (rappel condensé de C1)
Une seule page centrée (`ui/moi.js`, `.page-inner` 640 px même sur desktop —
**C2**) empile, au même poids : profil · modèles d'emails · CV/lettre PDF ·
sauvegarde/restauration · Verrouillage · **Mes appareils** (tout le §C) ·
**Connexions** (2 messageries + **6 familles d'IA**) · Coup de pouce IA · aide.
Du plus anodin (« mon prénom ») au plus pointu (anneau d'appareils, clés d'IA).

### Pourquoi c'est le nœud
« Moi » est devenu **le tiroir par défaut de tout le neuf**. Trois natures s'y
mélangent :
1. **Mon identité & mes contenus** (profil, modèles, CV/lettre) — léger, pour
   tous, *sert à écrire des emails*.
2. **Mon filet de sécurité** (sauvegarde/restauration) — vital en local-first,
   à **promouvoir**, pas à enterrer.
3. **La configuration du système** (verrou, appareils, connexions, IA,
   Compagnon) — avancé, ponctuel, *sert à faire tourner la machine*.

Tant qu'elles cohabitent, aucun repère : l'utilisateur ne sait pas ce qui est
« à faire une fois » ni « pour les experts ».

### Direction proposée (structure cible, à valider — pas encore à coder)
Éclater « Moi » en **deux intentions claires**, cohérentes avec le principe
« *faire* vs *régler* » du diagnostic :

| Nouveau regroupement | Contenu | Ton |
|---|---|---|
| **Profil & données** (reste « Moi », léger) | identité, formation, contact · modèles d'emails · CV & lettre · **sauvegarde/restauration mise en avant** | pour tous, quotidien-ponctuel |
| **Réglages** (nouvel espace, avancé replié) | Verrouillage · Mes appareils (quotidien + sécurité avancée repliée) · Connexions messagerie · **espace IA unifié** (familles d'IA + prompts + analyse d'e-mails + propositions) · Compagnon | ponctuel / expert, progressive disclosure |

Points d'attention :
- **La sauvegarde ne descend pas avec l'avancé** : c'est un filet de sécurité,
  à garder visible et à rappeler dans l'onboarding (**C6**).
- **Regrouper l'IA** qui est aujourd'hui éparpillée sur trois écrans
  (Connexions, Coup de pouce IA dans Moi, « Depuis mes e-mails » dans Recevoir,
  propositions dans Aujourd'hui) — une seule maison IA lèverait beaucoup de la
  confusion actuelle.
- **Desktop** : « Réglages » est l'endroit naturel pour donner enfin de la
  largeur (colonnes, panneaux) au lieu de la colonne centrée.

---

## Synthèse des nouvelles trouvailles (à ajouter à la priorisation du diagnostic)

| # | Zone | Trouvaille | Gravité | Renvoi |
|---|---|---|---|---|
| N1 | Tri/filtres | Constructeur multi-niveaux + 3 icônes muettes en contrôle par défaut | 🟠 | C5 |
| N2 | Tri | Sens du tri réglable à deux endroits (barre + feuille) | 🟡 | — |
| N3 | Tri/filtres | Deux grammaires (chips vs pile) pour deux boutons voisins | 🟡 | C4 |
| N4 | Campagnes | Aucune maison ; la ligne disparaît quand rien n'est dû | 🔴 | C7 |
| N5 | Campagnes | Rappel placé au-dessus du travail du jour, tronqué | 🟠 | C4 |
| N6 | Campagnes | Pistes sans email écartées en fin de parcours | 🟠 | — |
| N7 | Campagnes | Variables `{{}}` brutes + Compagnon vendu dans le wizard | 🟡 | C5 |
| N8 | Compagnon | **Double fenêtre modale sur desktop** (motif feuille-sur-feuille) | 🟠 | — |
| N9 | Compagnon | Pré-requis (protéger, principal) découverts après le clic | 🟠 | C3 |
| N10 | Sync | Machinerie experte (TURN, effacement distant) au même lieu que le quotidien | 🟠 | C5 |
| N11 | Sync | Phrase de liaison affichée en clair en permanence | 🟡 | — |
| N12 | Moi | Trois natures mélangées ; à éclater « Profil & données » / « Réglages » | 🔴 | C1 |

**N4, N8 et N12** rejoignent le haut de la file (structurel / friction visible).
Le reste s'absorbe dans les livraisons P1/P2 du diagnostic.

---

*Vérifié dans l'app réelle (captures à l'appui, `?test` 91/91, zéro erreur
console hors échecs réseau P2P attendus). Prochaine étape : valider avec le
mainteneur la structure cible de « Moi » (E) et le sort des campagnes (B),
puis n'ouvrir le chantier qu'écran par écran, mobile d'abord.*
