Barre de sélection multiple : fenêtre relevée (ombre modale) avec compteur en mono, outils de sélection sur la première ligne, actions groupées pleine largeur dessous. Aucune action groupée cliquable tant que rien n'est sélectionné (désactiver côté hôte). Position fixe gérée par l'écran hôte, au-dessus de la nav basse sur mobile.

```jsx
<SelectionBar
  count={3}
  tools={<>
    <Button size="sm">Tout</Button>
    <Button size="sm">Aucune</Button>
    <IconButton icon="close" size="sm" variant="ghost" aria-label="Annuler la sélection" />
  </>}
  actions={<>
    <Button size="sm" variant="primary">Prospecter</Button>
    <Button size="sm">Partager</Button>
    <Button size="sm" variant="danger">Supprimer</Button>
  </>}
/>
```
