Barre d'annulation (filet de sécurité) affichée ~30 s après une fusion ou une restauration : LED ambre carrée, message système factuel en mono (« Fusion terminée : 4 ajouts, 0 écrasement. »), bouton primaire « Annuler », fermeture discrète. La minuterie et la position fixe (bas d'écran, au-dessus de la nav basse mobile) sont gérées par l'hôte.

```jsx
<UndoBar
  message="Fusion terminée : 4 ajouts, 2 fiches complétées."
  actionLabel="Annuler la fusion"
  onAction={undo}
  onDismiss={hide}
  iconBase="../../../assets/icons/"
/>
```
