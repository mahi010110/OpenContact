# Open-Contact — Système de design « Utilitaire 98 »

Identité visuelle d'**Open-Contact**, l'outil communautaire local-first pour trouver, enrichir et partager des pistes de stage/alternance/emploi (sans compte, sans serveur, fichiers `.oc` échangés de la main à la main).
Source produit : ce dépôt (`mahi010110/OpenContact`) — le kit vit dans `design/`, l'application de référence est à la racine (`index.html`, `app.js`, `engine/`).

**Direction : « Utilitaire 98 »** — réinterprétation moderne des interfaces Windows 98 / Macintosh classique : simplicité, sobriété, lisibilité, efficacité. Pas un pastiche : les codes d'époque (biseaux, barres de titre, coins carrés, trames, pixel-art) sont modernisés — bordures 1px, ombres dures sans flou, palette AA, mode sombre réel.

## Fondations visuelles

- **Neutres** : gris système chauds (`--gray-0…3`, `--gray-desktop` #E7E5DD) + encre #1D242C. Fond de page = « bureau », contenus = « fenêtres ».
- **Accents** : **teal #0B7268** = tout l'interactif (boutons primaires, liens, coches) — pont entre le teal Win98 et le vert Open-Contact historique. **Marine #27337F** = uniquement sélection (fond marine, texte blanc — la signature) et barres de titre accentuées. Jamais les deux sur un même élément.
- **Sémantique** : texte foncé sur lavis clair (`--green/--amber/--red` + `-wash`). Pas de texte blanc sur couleur vive hors boutons primaires.
- **Mode sombre** (`html[data-theme="dark"]`) : anthracite doux, PAS une inversion — les bordures fortes passent en gris clair (interface « filaire »), teal lumineux #3BC9BA, ombres noires dures.
- **Géométrie** : grille 4px (`--space-1…8`). Rayons : **0 ou 2px seulement**. Bordures 1px encre. Seuls cercles autorisés : radio et pins de carte. Contrôles 24/32/40px (44px tactile).
- **Relief** : 3 états — relevé (`--bevel-up` + `--shadow-raised`), enfoncé (`--bevel-down`), en creux (`--bevel-field`). Ombres **décalées nettes, jamais de flou** (`--shadow-raised/window/modal` : 2/4/6px). Presse d'un bouton = ombre disparaît + translation 2px.
- **Trames** (`--dither`, `--dither-strong`, `--scanlines`) : texture maison, avec parcimonie — barres de titre inactives, badge PRIVÉ, onglets inactifs, voile de modale. Jamais derrière un paragraphe.
- **Focus** : pointillé 1px (`--focus-outline`), offset 2px. **Sélection** : fond marine, texte blanc.
- **Mouvement** : états instantanés (0ms), menus 120ms, modales 180ms ; déplacements en `steps()` — l'interface claque, elle ne flotte pas. Pas de flou, pas de dégradés doux, pas de glow, pas de parallaxe.
- **Fond** : à-plats uniquement. Pas d'images décoratives, pas d'illustrations ; la trame dither est la seule texture.

## Typographie (auto-hébergée, `assets/fonts/`, licences OFL incluses)

- **Public Sans** (variable 100–900 + italique) : UI et prose. Titres 700 tracking -0.01em.
- **IBM Plex Mono** (400/500/600) : données, compteurs, dates, chips, barres d'état, code. Jamais la prose.
- **Silkscreen** (400/700) : accent bitmap — wordmark, barres de titre, badges, `kbd`, versions. **Uniquement à 8/16/24px**, capitales.
- Échelle : 11/12/13/14/15/16/20/26/34px (`--text-*`). UI par défaut 14px.

## Iconographie

**pixelarticons** (MIT, halfmage) — 73 icônes copiées dans `assets/icons/` (racine du dépôt), grille 24px, `fill="currentColor"`. Tailles 16/24/32px, `image-rendering:pixelated`. Composant `Icon` (mask CSS) pour la teinte. Chevron/coche inlinés en data-URI dans Select/Checkbox. **Plus d'emoji dans l'interface** (l'app actuelle en use ; la nouvelle identité les remplace par ces icônes). Pas d'icônes dessinées à la main hors des 3 pistes de logo demandées.

## Contenu & ton

- **Guidage** : tutoiement, direct, pédagogue, rassurant. « Ça suffit pour enregistrer — le reste se complète quand tu veux. »
- **Système** : factuel, chiffré, point final, en mono. « Piste enregistrée. » « Fusion terminée : 4 ajouts, 0 écrasement. »
- Honnête sur les limites (héritage du produit) : « perdu = irrécupérable », « une IA peut inventer ».
- Interdits : emoji, exclamations, « avec succès », vouvoiement, marketing. Étiquettes de champs en petites capitales ; badges Silkscreen en capitales (PARTAGÉ, PRIVÉ).
- **Nom de la marque** : le produit s'écrit **OpenContact** partout (texte, code, manifeste, exports, documentation). La graphie « OPEN-CONTACT » (trait d'union) est réservée au **wordmark en Silkscreen capitales** — le trait d'union y aide la lecture bitmap. Aucun autre usage du trait d'union.

## Logo — 3 pistes (`assets/logo/`)

- **A — Réseau pixel** (`piste-a-reseau.svg`) : le maillage actuel (1 nœud teal + 2 contacts en anneaux carrés) sur grille 2px, liens en escalier. Continuité maximale.
- **B — Fenêtre-carnet** (`piste-b-fenetre.svg`) : fenêtre système miniature contenant deux contacts reliés. La plus « 98 » ; excellent favicon.
- **C — Monogramme OC** (`piste-c-monogramme.svg`) : O teal + C encre sur grille 4px, façon caractère bitmap. Le plus intemporel.
- Lockup : icône + « OPEN-CONTACT » en Silkscreen (16 ou 24px). Marques originales créées pour ce projet (demande explicite) ; l'ancien logo vit dans `icon.svg`.

## Index

Le kit vit dans `design/` ; la **source unique** des tokens et des ressources est à la racine du dépôt (`styles/tokens/`, `assets/`) — la production et le kit consomment les mêmes fichiers.

- `styles.css` → importe `../styles/tokens/` : `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `base.css`
- `components/forms/` : Button, IconButton, Input (multiline pour les zones de texte), Select, Checkbox, Radio, Switch, Field
- `components/surfaces/` : Window (conteneur signature), Dialog, Sheet, Fieldset
- `components/display/` : Icon, Badge, Chip, Score, Tabs, Toast
- `components/app/` : BottomNav, SelectionBar, UndoBar, EmptyState — les motifs propres à l'application
- `guidelines/` : cartes spécimens (type, couleurs, spacing, effets, icônes, ton, logos)
- `ui_kits/opencontact/` : écran « Pistes » desktop, interactif (clair/sombre, modale)
- `ui_kits/opencontact-mobile/` : le même écran à 390×844 — nav basse, tiroir, cibles 44px
- `../assets/` : `fonts/` (WOFF2 + licences OFL), `icons/`, `logo/` — l'app de référence est le dépôt lui-même
- `vendor/` : react, react-dom, babel-standalone en local — les cartes et maquettes fonctionnent hors ligne, sans CDN
- `_kit_loader.js` : chargeur des cartes/maquettes — expose `window.OC` (utilise `_ds_bundle.js` compilé s'il existe, sinon transpile `components/` via Babel)

**Ajouts intentionnels** : `Icon` (teinte des SVG pixel) ; set de composants standard créé from scratch (aucune bibliothèque source n'existait) ; `_kit_loader.js` (runtime des cartes en attendant le bundle compilé).
