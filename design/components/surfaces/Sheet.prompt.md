Panneau mobile qui glisse depuis le bas : poignée = barre de titre tramée (dither) avec témoin de glissement rectangulaire (jamais de pilule arrondie), titre Silkscreen 8px, corps défilant. Un tap sur la poignée referme ; le geste de glisser est câblé par l'écran hôte. `snap="full"` pour un panneau presque plein écran.

```jsx
<Sheet open={open} onClose={close} title="Pistes" count="6" flush>
  {listeDePistes}
</Sheet>
```
