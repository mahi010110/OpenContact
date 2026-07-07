Bouton système au relief biseauté ; l'action principale est en teal, la presse enfonce physiquement le bouton de 2px.

```jsx
<Button variant="primary" onClick={save}>Enregistrer la piste</Button>
<Button>Annuler</Button>
<Button variant="danger" size="sm">Supprimer</Button>
```

Variants : `default` (gris chrome), `primary` (teal), `danger` (texte rouge), `ghost` (plat, sans bordure). Tailles : `sm` 24px, `md` 32px, `lg` 40px. Le disabled grave le texte dans le chrome (text-shadow clair).
