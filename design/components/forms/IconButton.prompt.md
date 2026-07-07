Bouton carré à icône pixel-art seule (32×32px), même relief que Button ; exige un aria-label.

```jsx
<IconButton icon="search" aria-label="Rechercher" />
<IconButton icon="close" variant="ghost" aria-label="Fermer" />
```

`icon` = nom de fichier dans `assets/icons/` (ex : `search`, `plus`, `trash`). Si la page n'est pas à la racine du projet, passer `iconBase` avec le chemin relatif vers `assets/icons/` à la racine du dépôt.
