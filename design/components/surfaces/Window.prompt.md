Le conteneur signature d'OpenContact : fenêtre à barre de titre pixel (Silkscreen), corps, barre d'état mono optionnelle, ombre dure sans flou.

```jsx
<Window title="Mes pistes" icon="map-pin" onClose={close}
        statusBar={<span>12 pistes — 3 contacts</span>}>
  …contenu…
</Window>
```

`variant="accent"` (marine) pour la fenêtre active/importante, `variant="inactive"` pour une fenêtre secondaire (barre grise tramée). `flat` pour les cartes en liste (ombre 2px), `flush` pour un corps sans padding.
