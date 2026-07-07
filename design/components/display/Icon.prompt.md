Icône pixel-art du set pixelarticons (grille 24px), teintée par la couleur de texte courante.

```jsx
<Icon name="map-pin" size={16} />
<span style={{color:'var(--accent)'}}><Icon name="check" size={24} /></span>
```

`name` = fichier dans `assets/icons/` sans `.svg`. Tailles en multiples de 8 (16/24/32) pour rester net. Depuis une page hors racine : `base` avec le chemin relatif vers `assets/icons/` à la racine du dépôt.
