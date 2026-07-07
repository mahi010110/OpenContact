État vide : une fenêtre système centrée qui porte la promesse du produit. Accroche en gras, phrase courte, trio de principes (icône pixel accent + verbe), actions empilées pleine largeur avec la primaire en premier. Pas d'illustration décorative — la fenêtre EST le décor.

```jsx
<EmptyState
  heading="Toutes les pistes utiles, au même endroit"
  description="Entreprises, contacts, conseils : ce que chacun découvre profite à tous."
  principles={[
    { icon: 'search', label: 'Trouve' },
    { icon: 'plus', label: 'Contribue' },
    { icon: 'share', label: 'Partage' },
  ]}
  actions={<>
    <Button variant="primary">Ajouter ma première piste</Button>
    <Button>Importer des pistes reçues</Button>
  </>}
  iconBase="../../../assets/icons/"
/>
```
