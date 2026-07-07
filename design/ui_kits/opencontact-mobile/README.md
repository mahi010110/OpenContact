# UI kit — OpenContact (mobile, 390 × 844)

L'épreuve du style « Utilitaire 98 » sur petit écran : le langage pensé pour
la souris doit survivre au pouce.

Ce que la maquette démontre :

- **Nav basse** (`BottomNav`) : onglets plats, actif en sélection marine,
  bouton d'ajout central carré biseauté — pas de bouton flottant rond.
- **Tiroir de résultats** (`Sheet`) : poignée-barre de titre tramée toujours
  visible (28 px) ; un tap l'ouvre à mi-hauteur, un autre la replie. La ligne
  de confiance (« données locales · suivi privé ») vit au pied du tiroir.
- **Carte** : pins carrés de 14 px centrés dans une **cible tactile de
  44 px** ; sélection = anneau marine.
- **Modale plein écran** : la fenêtre système occupe tout l'écran, corps
  défilant, pied d'actions fixe à portée de pouce (Annuler / Enregistrer).
- **Cibles 44 px partout** et saisie à 16 px (pas de zoom iOS forcé) — la
  surcouche `<style>` de cette page est exactement la media query que la
  production appliquera.
- **Thème** : bascule clair/sombre par l'icône `invert`.

Interactif : thème, ouverture/repli du tiroir, sélection d'une piste (carte
et liste synchronisées), modale, toast de confirmation.

La zone carte est un placeholder — en production, le fond CARTO/Leaflet
reprend ces pins carrés.
