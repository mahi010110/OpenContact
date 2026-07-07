Navigation basse mobile : onglets plats à icône pixel + libellé 11px, onglet actif en sélection marine (fond marine, texte blanc, bordure encre). Le bouton d'ajout central est un carré biseauté accent de 52px — le style n'a pas de bouton flottant rond. Cibles 44px minimum, safe-areas gérées.

```jsx
<BottomNav
  iconBase="../../../assets/icons/"
  items={[
    { icon: 'map-pin', label: 'Pistes', active: true },
    { icon: 'clipboard', label: 'Suivi' },
    { icon: 'share', label: 'Partager' },
    { icon: 'user', label: 'Profil' },
  ]}
  onAdd={openForm}
/>
```
