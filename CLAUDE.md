# OpenContact — référence produit & UI/UX

**Ce fichier fait autorité.** Il centralise ce qu'il faut connaître pour
concevoir et développer n'importe quelle fonctionnalité du projet, quel que
soit le compte ou l'assistant qui travaille. Aucune décision UI/UX ne se
prend isolément : si une idée n'entre pas dans les règles ci-dessous, on
adapte l'idée — ou on discute la règle avec le mainteneur — mais on ne crée
pas d'exception silencieuse.

À lire avec : `CONTRAT.md` (contrat de données exécutable, vérifié par
`?test`), `docs/refonte-brief.md` (la vision d'origine),
`docs/degraissage-v6.3.md` (**chantier en cours — fait foi sur ce qu'il
traite** : suppression au geste, diète de texte, Échanger, tri/ordre),
`docs/plan-v7.md` (feuille de route), `design/` (kit « Utilitaire 98 »).

## 1. Le produit en une phrase

OpenContact aide un étudiant IT/cyber à répondre à **« je fais quoi
maintenant ? »** dans sa recherche de stage/alternance/emploi, et fait
circuler les bonnes pistes dans sa promo. C'est un outil de **motivation et
d'action**, pas une base de données : chaque écran doit pousser vers le
prochain geste concret (écrire, relancer, planifier).

- **Utilisateur type** : étudiant BTS SIO / BUT, sur son téléphone, entre
  deux cours. Le mobile est le contexte premier ; l'ordinateur est le poste
  de commandement (tableau, saisie longue).
- **Local-first, sans compte, sans serveur** : les données vivent sur les
  appareils de l'utilisateur et circulent en P2P (WebRTC) ou par fichier
  `.oc`. Aucun backend, jamais. Le fichier `.oc` est LE repli universel :
  il marche hors ligne, réseau bloqué, de la main à la main.

## 2. Les invariants produit (à ne jamais casser)

1. **Le privé ne sort jamais dans un partage.** Statuts, notes, actions,
   historique, journal = suivi privé. Seule exception : la sync entre les
   appareils DE LA MÊME personne (voir CONTRAT.md §5). Tout écran de partage
   le rappelle sobrement (`tag-share` « jamais le privé »).
2. **On n'écrase jamais silencieusement.** Fusion = compléter les vides ;
   divergence = comptée et montrée, l'existant est gardé. Toujours un
   **aperçu avant** (fusion à blanc sur copie) et un **Annuler ~30 s**
   (`showUndo`) après tout geste lourd (fusion, restauration, suppression,
   sync).
3. **Une décision à la fois.** Les feuilles posent UNE question, chaque tap
   valide et referme. Pas de formulaires-tunnels, pas de double validation.
4. **Toute donnée saisie est précieuse.** Rien ne se perd sans confirmation
   + annulation. Les contenus reçus non rattachables vont dans un bac
   (« Contacts à rattacher »), jamais à la poubelle.
5. **Ça marche hors ligne.** Toute fonctionnalité doit avoir un chemin sans
   réseau, ou dégrader proprement (le géocodage et le P2P échouent en
   silence utile : message court + repli proposé).
6. **Zéro dépendance réseau au démarrage.** Les libs sont vendorisées dans
   `assets/vendor/` (avec leur licence), chargées paresseusement. Jamais de
   CDN, jamais d'analytics, jamais de framework (vanilla JS, modules ES).

## 3. Architecture — la règle de sens unique

- `engine/` = le moteur : modèle, stockage, fusions, chiffrement, score,
  filtres. **Fonctions pures, aucun accès au DOM ni à l'écran.** Toute
  logique métier testable vit ici, couverte par `tests.js` (`?test` dans
  l'URL doit rester 100 % vert).
- `ui/` = les écrans. Un fichier par écran/feuille. L'UI appelle le moteur,
  jamais l'inverse.
- `CONTRAT.md` = les clés de stockage, formats `.oc`/OCQ, schémas et
  invariants de fusion. **On ne renomme jamais une clé** ; un format qui
  évolue = une clé nouvelle + migration en lecture. Toute évolution du
  contrat se fait dans le document ET dans `tests.js` en même temps.
- `sw.js` : chaque livraison qui touche un fichier précaché **incrémente
  `CACHE`** (`oc-vN`) et met à jour `PRECACHE`.

## 4. Le design « Utilitaire 98 »

Identité : un utilitaire de bureau années 98 remis au goût du jour —
honnête, dense, net. Sources uniques : `styles/tokens/` (couleurs, typos,
espacements, effets) et le kit `design/`.

- **Couleurs** : encre sur papier, accent teal `#0B7268`, sélection navy.
  Toujours via les tokens (`var(--…)`), jamais de couleur en dur.
- **Reliefs** : bevels francs et ombres dures (`--bevel-*`, `--shadow-*`).
  **Interdits : dégradés, ombres floues, coins très arrondis, glassmorphism.**
- **Typo** : Silkscreen (titres pixel), IBM Plex Mono (données, métadonnées),
  Public Sans (texte courant). Pas d'autre police.
- **Icônes** : pixelarticons via `ic('nom', 'ic-14')` (masque CSS teinté par
  `currentColor`). Pas d'emoji dans l'UI (sauf rare ponctuation de toast),
  pas d'autre pack d'icônes.
- **Motion (#23)** : les **objets** restent « 98 » — nets, instantanés,
  `steps()` pour le feedback (secousse, bascule d'état). Seul le
  **déplacement entre états** est doux (feuille qui monte, panneau qui
  entre, liste qui se réorganise, barre qui se pose) : court, `ease-out`,
  senti sans être vu, jamais décoratif. `transform`/`opacity` uniquement,
  transitions CSS, `prefers-reduced-motion` respecté (coupe tout).
- **Thème sombre obligatoire** : tout nouvel élément se vérifie dans les
  deux thèmes (l'encre passe par `currentColor`/tokens, jamais de couleur
  fixe qui disparaît en sombre).

## 5. Adaptatif, PAS responsive

L'application n'est **pas** une page qui se redimensionne : ce sont des
interfaces **pensées par contexte**, qui partagent les données et le style.

- **Breakpoint unique : 901 px** (`matchMedia('(min-width:901px)')`, avec
  re-rendu au franchissement — voir `ui/pistes.js`).
- **Mobile (< 901 px)** : navigation en bas (`bottomnav`), contrôles 44 px
  (`--ctl`), feuilles = bottom sheets, listes verticales, gestes tactiles
  (glisser pour fermer/agir), une main, un pouce.
- **Desktop (≥ 901 px)** : navigation en haut + barre de statut, contrôles
  32 px, feuilles = fenêtres centrées, layouts en colonnes (ex. : le board
  3 colonnes de « Mes pistes »), raccourcis clavier (« / » = recherche).
- **Règle de conception** : pour toute nouvelle UI, se demander « à quoi ça
  ressemble à 390 px ? à 1280 px ? » et concevoir DEUX réponses si les
  usages diffèrent — pas une seule qui s'étire. Si le comportement doit
  différer (pas juste la taille), brancher sur `matchMedia`, pas sur du CSS
  seul.

## 6. Catalogue des motifs d'interaction — à réutiliser AVANT d'inventer

Tout vit dans `ui/dom.js` sauf mention. Un besoin nouveau se résout d'abord
avec un motif existant :

| Besoin | Motif |
|---|---|
| Poser une question, éditer | `openSheet` (feuilles empilables, focus-trap, Échap, glisser-fermer tactile, `setFoot` REMPLACE les boutons, `guard` = garde-fou avant fermeture) |
| Trier une liste | `ui/sort.js` — bouton critère + bascule ↑↓ ; re-tap sur le critère actif = retour au défaut de l'écran. Le même contrôle partout (Mes pistes, Prospecter, Donner) |
| Supprimer au geste | `bindDeleteGesture(node, onDelete)` — le nœud fournit un enfant `.sw-in` ; glisser (mobile) / poubelle au survol (desktop), l'appelant double d'un `showUndo` |
| Choisir parmi 2-5 options | `pick-list` / `.pick` (gros boutons b + span descriptif) |
| Choisir une date | chips « Demain / +3 j / +7 j / Lundi » + date précise validée par OK (jamais de fermeture sur `change` seul — roue iOS) |
| Confirmer un geste risqué | `confirmSheet` (danger = `btn-danger`) |
| Geste lourd réversible | `showUndo(msg, onUndo)` — barre Annuler ~30 s |
| Retour discret | `toast()` — court, ponctuel, jamais deux phrases |
| Marquer partagé vs privé | `tag-share` / `tag-priv` |
| Note contextuelle | `<p class="hint">` (+ `warn` si alerte) — une seule par écran si possible |
| Multi-sélection (choisir quoi partager) | `.pk` avec icônes checkbox/checkbox-on — **plus utilisé pour supprimer** |
| Supprimer un élément (piste, prompt) | geste : **glisser** (mobile) / **poubelle au survol** (desktop) + `showUndo`, sans confirmation. Uniquement dans « Mes pistes » pour les pistes |
| Fermer une barre transitoire (toast, Annuler, bandeau) | **balayer** (mobile) / **`✕`** (desktop) |
| Contenu secondaire | `<details class="pcard pcard-details">` replié |
| Recevoir des données | TOUJOURS l'aperçu avant fusion (`mergePreviewInto`) — mêmes règles quel que soit le canal (fichier, QR, P2P) |

Règles d'écran : un bouton primaire max par vue ; **une suppression unitaire
réversible se fait au geste (glisser / poubelle au survol) + `showUndo`, sans
confirmation** ; seules les actions lourdes ou irréversibles (tout supprimer,
remplacer, retirer un appareil, rompre le lien) gardent `confirmSheet`
(`btn-danger`) ; l'état vide de chaque écran enseigne le produit (pas un
simple « aucune donnée »).

## 7. Les textes

Français, tutoiement, phrases courtes, concret. On parle « pistes »,
« promo », « fiche », « suivi » — jamais « CRM », « lead », « sync LWW » ni
autre jargon à l'écran. Les rappels de sécurité/valeur sont **courts et
placés au moment du geste** (pas de paragraphes préventifs — la v6.1 a
allégé, on ne réalourdit pas). Microcopie type : « Seules les fiches
partent — jamais ton suivi privé. » **Par défaut, un mot ou une icône
suffit ; une phrase entière seulement quand la sécurité l'exige.**

## 8. Partage & sync — les deux mondes à ne pas mélanger

1. **Communautaire** (promo) : `sharePayload` → vue communautaire, jamais le
   privé, fusion `merge.js` qui n'écrase rien + aperçu avant. Canaux : partage
   en groupe (P2P), QR, fichier `.oc`, coller.
2. **Mes appareils** (même personne) : `engine/sync.js`, TOUT circule (privé
   inclus), le plus récent gagne (`updatedAt`), suppressions par tombstones.
   Canal : P2P avec phrase de liaison personnelle (hashée pour nommer la
   salle, données chiffrées de pair à pair). Le lien est **persistant**
   (`ui/synclive.js`) : tant que la phrase existe, l'app rejoint la salle en
   arrière-plan au démarrage et chaque enregistrement se propage — jusqu'à
   « Rompre le lien ». La feuille « Mes appareils » n'est que le poste de
   gestion de cet état.

Le transport P2P est Trystero (vendorisé) via relais Nostr publics —
personnalisables (`oc_relays_v1`). Le partage en groupe reste une **bêta
discrète** : fonctionnelle et soignée, mais jamais mise en avant au
détriment des chemins éprouvés (QR, fichier).

## 9. Livrer — la checklist

1. Le moteur d'abord (fonctions pures + tests), l'UI ensuite.
2. **Vérifier en lançant réellement** : serveur statique + Playwright,
   390×844 (tactile) ET 1280×800, thème clair ET sombre, zéro erreur
   console. On ne livre pas sur la foi d'une relecture.
3. `?test` : tous les auto-tests verts, y compris les nouveaux.
4. `CONTRAT.md` à jour si une clé/format/invariant a bougé.
5. `sw.js` : bump `oc-vN` + `PRECACHE` si un fichier précaché a changé.
6. Textes relus (ton, brièveté), thème sombre vérifié, cibles tactiles
   ≥ 44 px mobile.
7. Commits en français, descriptifs, focalisés.

## 10. Interdits absolus

- Serveur, compte, analytics, tracking — sous aucune forme.
- Framework front, bundler, étape de build, dépendance CDN.
- Renommer/supprimer une clé de stockage ou casser un format `.oc` existant.
- Faire sortir du privé dans un partage communautaire.
- Écraser des données sans aperçu + annulation.
- Dégrader l'existant pour caser une nouveauté : une fonctionnalité qui ne
  s'intègre pas discrètement (élégante, sobre, cohérente) n'est pas prête.
