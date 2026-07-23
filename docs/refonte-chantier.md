# Refonte OpenContact — journal de chantier

> Plan de mise en œuvre des 23 décisions de `docs/refonte-calibrage.md`
> (le Handoff en fin de document fait feuille de route). S'appuie sur les
> diagnostics `docs/audit-ux-2026.md` (C1–C9) et
> `docs/audit-ux-2026-nouveautes.md` (N1–N12). Ce journal se coche au fil
> des livraisons — chaque étape est vérifiée en lançant l'app (390 px +
> 1280 px, clair + sombre, `?test` vert, zéro erreur console).

Statut : **toutes les étapes livrées** (phases 0 à 4 cochées ci-dessous).
Dernier état vérifié : `?test` 97/97, suite complète
`node tests/e2e/tous.mjs` **19/19** (scénarios natifs contre le vrai
binaire inclus), zéro erreur console, captures 390/1280 clair/sombre.
Base de départ : `?test` 91/91.

## L'écart mesuré (état au 2026-07-22)

- **Modèle** : aucun champ d'action au contact — « premier email deviné »
  partout (mail.js `cts[0]`, prospect « pas d'email — écarté »).
- **Aujourd'hui** : 5 bandeaux empilés AU-DESSUS du travail
  (`today.js:104-109`), campagnes en tête et tronquées ; desktop = colonne
  mobile centrée (640 px).
- **Mes pistes** : statut affiché 2× (pastille + étiquette) ; 3 icônes
  muettes (filtre, tri, sens) ; tri multi-niveaux au premier plan ; bac
  « à rattacher » ouvert par défaut ; campagnes sans maison.
- **La fiche** : mur de contacts, sections toujours visibles, « Écrire »
  empile une 2ᵉ modale.
- **Écrire** : pas de pièce jointe CV/LM (buildMime = texte seul) ;
  warning « profil vide » ; « Envoyer » grisé au lieu d'absent.
- **Capture** : un seul bloc + lien « Plutôt un contact ? » ; le contact
  demande un détour par la fiche.
- **Échanger** : « Depuis mes e-mails » dans Recevoir ; « bêta » permanent ;
  pavés d'explication ; pas de code fort généré.
- **Moi** : 8 mondes au même poids ; bibliothèque de prompts ; murs
  « Protéger d'abord » après le clic (N9) ; phrase de liaison en clair (N11) ;
  TURN/anneau au même niveau que le quotidien (N10).
- **Transverse** : `openSheet` empile (N8) ; motion : `steps()` seul.

## Les étapes

Chaque livraison : mobile d'abord · petite et focalisée · `?test` vert +
nouveaux tests · `sw.js` bump si un précaché bouge · `CONTRAT.md` si un
format bouge · commit français focalisé.

### Phase 0 — le socle

- [x] **0.1 Modèle contact/action (#14)** *(livré — `?test` 95/95)* — champs **optionnels, absents
  quand vides** (comme `extra`) : au contact `activatedAt` (jour ISO —
  contact « activé », sinon dormant) et `src` (`'promo'` = reçu du
  partage) ; à la piste `nextActionCt` (id du contact visé par la
  prochaine action). Privés tous les trois : `communityView` ne les émet
  jamais (et purge leurs doublons d'`extra`), la fusion communautaire vide
  `activatedAt`/`nextActionCt` entrants et pose `src:'promo'` sur tout
  contact ajouté par partage. Migration en lecture : promotion depuis
  `extra` (aller-retour avec un appareil ancien).
  Fichiers : `engine/model.js`, `engine/exchange.js`, `engine/merge.js`,
  `CONTRAT.md` §3, `tests.js` (+7), `sw.js`.
  Risques : tests-contrat « champs exacts » (champs conditionnels → intacts
  pour une entrée nue) ; fuite via `extra` (test dédié).
- [x] **0.2 Dissoudre l'IA (#5)** *(livré — feuille autonome
  `openImportMails`, e2e analyse vert)* — « Depuis mes e-mails » quitte Recevoir
  et devient une source de la capture ; la bibliothèque de prompts quitte
  « Moi » (les données `profile.prompts` restent — compat sync).
  Fichiers : `ui/recevoir.js`, `ui/capture.js`, `ui/moi.js`, `sw.js`.
  Risques : le flux d'analyse (assistant/Compagnon) doit rester joignable —
  la chip « à trier » d'Aujourd'hui reste le retour.

### Phase 1 — navigation & « Moi » (#2, #20)

- [x] **1.1 « Moi » éclaté** *(livré — porte = 2ᵉ écran de « Moi » sur
  mobile, colonnes desktop ; e2e verrou/envoi/liaison verts)* — en haut *Profil & données* (Mon profil ·
  Modèles d'emails · CV & lettres · **Garder une copie** promue, état
  « N pistes depuis ta dernière copie », calmée si appareils reliés) ;
  en dessous **une porte « Réglages »** (mobile) / colonnes (desktop).
  « Restaurer » part dans Réglages (derrière le code). Nav : 4 entrées,
  inchangées. Fichiers : `ui/moi.js`, `ui/reglages.js` (nouveau),
  `styles/app.css`, `sw.js` (+PRECACHE), flag `lastBackupAt` dans
  `profile.flags` (additif).
  Risques : rien ne doit devenir injoignable ; desktop d'abord simple
  (colonnes), raffiné en Phase 3.

### Phase 2 — les écrans « faire », mobile d'abord

- [x] **2.1 Aujourd'hui (#10)** *(livré)* — ordre : ✓ N faites · EN RETARD ·
  AUJOURD'HUI · campagnes du jour (sous, jamais tronquées) · ⌄ Bientôt ·
  **« À trier (N) »** (une ligne calme qui regroupe reçu promo +
  propositions + analyse + contacts à rattacher). Desktop : liste + fiche
  en **panneau latéral** (mécanisme partagé, `ui/dom.js`).
  Fichiers : `ui/today.js`, `ui/dom.js` (panneau), `styles/app.css`.
- [x] **2.2 Mes pistes (#13) + « Affiner » (#8)** *(livré — e2e pistes vert)* — statut une seule fois
  (pastille texte+couleur) ; recherche héros + **un bouton « Affiner »**
  (feuille filtres + tri, même grammaire, multi-niveaux replié) ; état
  actif = **puces retirables** sous la recherche, le sens du tri vit dans
  la puce ; bac « à rattacher » = ligne calme repliée ; **« Campagnes (N) »**
  à côté de Prospecter (loi #6 : absent si aucune).
  Fichiers : `ui/pistes.js`, `ui/sort.js`, `ui/campagnes.js` (liste
  gestion), `styles/app.css`.
- [x] **2.3 La fiche (#15)** *(livré)* — héros : statut + prochaine action ;
  contacts en **liste compacte** (actifs en haut, dormants repliés « + N
  personnes connues », repère « reçu de la promo ») ; sections vides
  masquées (« Compléter » = la porte) ; desktop : panneau latéral ;
  « Écrire » remplace le contenu du panneau (fin du double-modal N8 ici).
  Fichiers : `ui/fiche.js`, `ui/state.js` (activation d'un contact),
  `ui/contact.js`, `styles/app.css`.
- [x] **2.4 Capture (#7)** *(livré — e2e parcours neuf vert)* — deux blocs (ENTREPRISE / CONTACT), deux
  boutons (« Ajouter » rafale · « Ajouter et compléter ») ; personne sans
  entreprise → bac, jamais bloqué ; email `nadia@ovh.com` → propose
  « OVHcloud » ; source « depuis mes e-mails » (posée en 0.2).
  Fichiers : `ui/capture.js`, `ui/state.js`, `styles/app.css`.
- [x] **2.5 Écrire (#16)** *(livré — ?test 97/97, e2e envoi + campagne verts)* — destinataire = la personne (pré-choisie par
  `nextActionCt`/activation) ; **pièce jointe réelle CV/LM** : variantes
  nommées dans `oc_docs_v1` (additif : `cv`/`lettre` hérités = premières
  variantes) + `buildMime` multipart & Graph `attachments` ; ligne 📎
  masquée si aucun doc ; profil vide → bouton « Compléter mon profil » ;
  pas d'email → « Envoyer » absent, « Copier » principal.
  Fichiers : `engine/mailer.js`, `engine/storage.js` (docs nommés),
  `ui/mail.js`, `ui/moi.js`, `CONTRAT.md` (docs), `tests.js` (MIME).
- [x] **2.6 Prospecter & campagnes (#17)** *(livré — e2e campagne vert)* — chaque envoi vers **une
  personne visible et choisie** ; piste sans contact → « ＋ ajoute
  quelqu'un » (N6) ; **zéro `{{}}`** : aperçu rempli, bouts dynamiques
  surlignés (composeur, wizard, modèles) ; Compagnon hors wizard.
  Fichiers : `ui/prospect.js`, `ui/campagnes.js`, `ui/mail.js`,
  `ui/profil.js` (modèles sans code), `styles/app.css`.
- [x] **2.7 Échanger (#18)** *(livré — e2e liaison vert)* — Recevoir = Scanner · Fichier · Coller (fait
  en 0.2) ; « bêta » retiré ; pavés d'explication retirés ; mot de passe
  groupe : bouton **générer un code fort** dans le champ + copier discret ;
  rappel « jamais ton suivi privé » au moment d'envoyer seulement.
  Fichiers : `ui/echanger.js`, `ui/direct.js` (openPromo), `ui/donner.js`.

### Phase 3 — Réglages en détail (#21)

- [x] **3.1 Cinq lignes claires** *(livré — sonde 390/1280, clair/sombre,
  e2e compagnon + compagnon-ia + ux-audit verts)* — Protection · Mes
  appareils · Ma messagerie · Mon assistant IA · Le Compagnon. La ligne
  Compagnon a un **vrai bouton** : « Télécharger » sur ordinateur (mène au
  téléchargement réel, sans verrou — la garde n'arrive qu'à l'association),
  « Copier le lien » sur téléphone (copie immédiate + toast). « Connexions »
  éclaté : `openConnexions` = Ma messagerie seule, `openAssistantIA` = sa
  propre porte (`#moiAi` recâblé). Explication **sur le 2ᵉ écran** seulement.
  Fichiers : `ui/moi.js` (lignes de Réglages), `ui/connexions.js`,
  `ui/compagnon.js`, `sw.js` (oc-v47).
- [x] **3.2 Ranger l'expert** *(livré)* — TURN + commandes d'appareils
  repliées sous « Sécurité avancée » (N10) ; **phrase de liaison masquée**
  par défaut dès qu'un appareil est relié, révélée d'un tap (N11) ; fini
  « Connecter → non » (N9) : sans protection, les lignes messagerie/IA
  disent le vrai premier geste — boutons « Protéger pour connecter » /
  « Protéger pour brancher » qui mènent tout droit au flux de protection ;
  les chemins qui arrivent par le composeur/campagnes passent par le même
  garde-fou actionnable (`gateProtect`).
  Fichiers : `ui/direct.js`, `ui/connexions.js`, `ui/moi.js`.

### Phase 4 — transverses & finitions (#22, #23)

- [x] **4.1 Une seule surface modale (N8)** *(livré — sonde desktop/mobile,
  e2e desktop rejoués verts)* — sur desktop, une feuille ouverte sur une
  autre **remplace sa fenêtre à l'écran** (`ov-behind`) ; la précédente
  attend, cachée, et revient à la fermeture. Seules les confirmations
  (`modal-confirm` — une question, un tap) se posent par-dessus. Mobile
  inchangé (les bottom sheets se couvrent déjà). `ui/dom.js`,
  `styles/app.css`, `sw.js` (oc-v48).
- [x] **4.2 Motion (#23)** *(livré — sonde easing/durée/reduced-motion,
  e2e pistes/analyse/ux-audit rejoués verts)* — objets « 98 » nets
  (steps() gardé pour la secousse du verrou, bevels instantanés) ;
  déplacements doux à l'`ease-out` court : feuille qui monte (`oc-up`
  12 px), panneau latéral qui entre (`oc-side`), barre Annuler qui se
  pose, toast, retour du glisser, lignes qui partent ; **liste qui se
  réorganise** au tri/filtre via `softReorder` (FLIP minimal dans
  `ui/dom.js` — transform seulement, no-op en reduced-motion et au-delà
  de 60 lignes), branché dans Mes pistes, Prospecter, Donner.
  `prefers-reduced-motion` coupe tout (déjà global, `base.css`).
  Règle motion de `CLAUDE.md` mise à jour. Fichiers :
  `styles/tokens/effects.css`, `styles/app.css`, `ui/dom.js`,
  `ui/pistes.js`, `ui/prospect.js`, `ui/donner.js`, `sw.js` (oc-v49).
- [x] **4.3 Passe finale** *(livré — suite complète rejouée)* —
  **cadenas = langage du privé** : déjà porté par les notes, les feuilles
  de partage, le profil, la messagerie ; ajouté aux deux endroits qui
  disaient « privé » sans le signe (en-tête de « Moi », étiquette
  « privé inclus » de la copie). **Verrou au bon moment** : couvert par
  N9 (lignes Réglages, gateProtect, association Compagnon, restauration).
  **Clavier** : focus visible global (`:focus-visible`, base.css),
  suppression au geste atteignable au clavier (`.sw:focus-within` révèle
  la poubelle), feuilles = focus-trap + Échap, statut d'une piste au
  clavier via la fiche (chemin universel du glisser). **Thème sombre**
  et **cibles ≥ 44 px** vérifiés en sonde sur chaque élément neuf.
  Fichiers : `ui/moi.js`, `sw.js` (oc-v50).

*(Le site séparé — guide + téléchargement du Compagnon — est un chantier
hors app, non couvert ici.)*
