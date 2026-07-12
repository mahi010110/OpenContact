# OpenContact — inspection UX & finitions (spec pour Fable 5)

Objectif : corriger des frictions précises **et** faire une **grande inspection UX** de toute l'app — trouver les problèmes et les corriger, dans l'esprit v6.3 (**moins de texte, moins de clics, plus de clarté**), sans couper de fonctionnalité ni ajouter de backend/dépendance.

Avant de coder : lis `CLAUDE.md` (il fait autorité, c'est ta grille de lecture) + `docs/degraissage-v6.3.md`. Garde `?test` vert (46/46).

## Trois corrections précises (déjà identifiées)

### 1. « Mes appareils » — clarté (`ui/direct.js`)
Le choix de départ déroute : « **Premier appareil** » / « **Appareil suivant** » (lignes ~118-119) cadrent sur l'ordre des appareils — personne ne pense son téléphone comme « premier » ou « suivant ». Recadre sur **l'action** :
- « **Créer une phrase** » — je démarre la liaison ici.
- « **Entrer une phrase** » — j'ai déjà une phrase (sur un autre appareil).

Et **coupe les explications** en trop (diète de texte) : sous-titre de 3-4 mots max, jamais une phrase. Simplifie **tout** le flux de liaison : le moins d'étapes et de mots possible pour arriver à « relié ». Vérifie que la notion reste juste dans les deux sens (créer / rejoindre) et en mode « changer de phrase ».

### 2. Le tri « ne revient pas » (`ui/sort.js`)
Le retour au défaut **existe mais est caché** : il ne marche qu'en rouvrant la feuille et en re-tapant le critère actif. L'utilisateur re-tape le **bouton** de tri et s'attend à **revenir à l'état normal** — or ça rouvre juste la feuille. Rends le retour au défaut **évident** : quand un tri non-défaut est actif (bouton déjà `sort-on`), un appui **réinitialise directement** au défaut de l'écran (critère **et** ordre), sans passer par la feuille. Trouve l'interaction la plus naturelle, mais l'attente « je re-tape → ça revient » doit être satisfaite. Applique-le partout où le tri est utilisé (Mes pistes, Prospecter, Donner).

### 3. Recherche + tri collants, en-tête qui s'efface au défilement
Sur les écrans à longue liste (Mes pistes, Prospecter…), quand on **descend** :
- l'**en-tête de page** (le gros titre) **s'efface** pour libérer de la place ;
- la **barre de recherche + les contrôles de tri restent collés** en haut, toujours accessibles.

Rends ça **intelligent et cohérent partout** où il y a une liste défilante. Adaptatif (surtout précieux sur mobile). Style 98 : transition courte / `steps`, rien de « smooth » long.

## La grande inspection UX

Passe **chaque écran et chaque feuille** à **390 px ET 1280 px**, thème **clair ET sombre**, avec des données réalistes (0, 1, 30, 80 pistes ; profils remplis et vides ; hors-ligne). Traque, avec `CLAUDE.md` comme grille :

- **Confusion** — libellés qui ne parlent pas, jargon, ordre d'actions illogique (comme « premier/suivant appareil »).
- **Trop de texte** — partout où un mot ou une icône suffirait.
- **Trop de clics** — un geste courant qui en demande plus que nécessaire.
- **Incohérences** — le même besoin traité différemment d'un écran à l'autre (unifier via le catalogue de motifs de `CLAUDE.md`).
- **Hiérarchie** — écrans sans « héros » clair, éléments de même poids qui se disputent l'œil.
- **États** — vides qui n'enseignent rien, erreurs muettes, cas limites (0 / 1 / beaucoup de pistes, réseau bloqué).
- **Adaptatif** — ce qui « s'étire » au lieu d'être pensé mobile vs desktop.
- **Thème sombre** — contrastes, couleurs qui disparaissent.
- **Accessibilité de base** — cibles ≥ 44 px mobile, focus visible, `aria-label` sur les boutons-icônes.

Corrige les vrais problèmes ; pour les **arbitrages produit** (ex. couper une info, changer un comportement notable), **signale-les au mainteneur** au lieu de trancher seul.

## Bornes

Aucune fonctionnalité coupée. Aucun backend, aucun compte, aucune dépendance nouvelle (vanilla JS, tout local). Ne casse pas les formats `.oc` / `CONTRAT.md`. `?test` reste vert + nouveaux tests si un comportement moteur bouge. `sw.js` bumpé si un fichier précaché change. Reste dans l'ADN : local-first, « 98 », privé jamais partagé.

## Méthode

1. **Livraison 1** : les trois corrections précises ci-dessus.
2. **Livraison 2+** : l'inspection — **montre-moi d'abord la liste des trouvailles classées** (par friction/gravité) **avant** de coder les grosses, pour qu'on priorise ensemble.

Vérifie chaque livraison en **lançant réellement** l'app (390 + 1280, clair + sombre, `?test` vert, zéro erreur console). Règle d'or v6.3 : **moins de texte, moins de clics.**
