# Feuille de route — après la v6.1

La v6.1 a posé les fondations issues de l'audit (fiabilité, sécurité,
stockage) et le premier étage communautaire (P2P en direct). Ce document
consigne ce qui a été décidé, ce qui reste à faire, et dans quel ordre.

## Fait en v6.1

**Fiabilité & sécurité**
- Dates en heure locale (`localISO`) — fini le décalage d'un jour entre
  minuit et 2 h (le `toISOString()` UTC).
- Liens de contact neutralisés (`safeUrl`) : un `javascript:` posé dans un
  fichier reçu ne devient jamais cliquable. + CSP dans `index.html`.
- Onglets multiples : `BroadcastChannel` — plus d'écrasement silencieux.
- `navigator.storage.persist()` demandé — Safari ne purge plus au bout de
  7 jours.
- Suppression de piste (enfin possible), avec tombstone qui voyage.
- Stockage principal en IndexedDB (`oc_kv_v1`), mêmes clés, localStorage en
  repli de lecture — capacité ×100, migration automatique.

**P2P (Trystero/WebRTC vendorisé, 58 Ko, MIT)**
- « Mes appareils » : phrase de liaison, sync complète LWW (privé inclus),
  suppressions propagées, convergence testée de bout en bout.
- « Partage en groupe » : mot de passe de groupe, fiches partageables en
  direct, aperçu avant fusion identique au fichier.
- Le `.oc` **reste** : c'est la sauvegarde, ET le repli qui marche toujours
  (réseau d'école bloquant WebRTC, hors-ligne, main à la main). Il passe
  au second plan dans l'UI (replié dans « Échanger »), pas à la trappe.

**Mobile / UX**
- Choix d'une date précise : validation explicite (bouton OK) — la roue
  iOS ne ferme plus la feuille sur une date intermédiaire.
- Feuilles fermables au glissement (barre de titre, tactile).
- Recherche des pistes sans saut de curseur.
- Textes et rappels de sécurité fortement allégés partout.
- Prompt IA « Mes emails → pistes » : l'assistant de l'utilisateur produit
  un JSON au format `share`, à coller dans Recevoir.

## Prochaines étapes (ordre recommandé)

1. **Tester en conditions réelles** : deux téléphones sur Wi-Fi
   d'établissement, 4G croisée, salle entière. Mesurer le taux d'échec de
   connexion P2P — c'est LA donnée qui calibre la suite. Les relais sont
   personnalisables (`oc_relays_v1`) si l'établissement bloque les publics.
2. **Tris / filtres exposés** dans « Mes pistes » (le moteur les a déjà :
   domaine, statut, score, A→Z) + changement de statut direct depuis le
   tableau desktop. **Livré (juillet 2026)** : bouton « Filtrer » à côté du
   tri (feuille statut + domaine, même grammaire que le tri : tap =
   applique, re-tap du bouton actif = tout montrer ; le statut n'est
   proposé qu'en liste — le tableau segmente déjà), et glisser une carte
   vers une autre colonne du tableau = statut changé, trace d'historique
   propre (`e2e-pistes.mjs`).
3. **Confirmations signées** : une paire de clés locale par utilisateur,
   « vérifié par N camarades » au lieu d'un compteur déclaratif —
   grosse valeur de confiance pour un petit effort (WebCrypto, attestations
   dans `extra`, rétrocompatible).
4. **Boîte aux lettres asynchrone** (Nostr) : publier les partages chiffrés
   (OC2) sur des relais, tagués par hash du mot de passe de groupe — la
   promo reçoit sans être en ligne en même temps. Limites : taille
   d'événement (~64 Ko → découper), rétention non garantie.
5. **Annuaire de promo co-édité (CRDT/Yjs)** : seulement si l'usage le
   réclame — document partagé séparé, jamais les pistes personnelles.
   Écarté pour l'instant : Waku (couvert par Nostr, plus lourd), IPFS
   (contenu public permanent = incompatible avec des coordonnées).

## Portage natif (mobile & ordinateur) — préparation

L'app est déjà bien placée : PWA installable, hors-ligne complet, zéro
build, moteur pur sans DOM. Chemin recommandé le moment venu :

- **Mobile : Capacitor.** Le dossier actuel se webview-ise tel quel.
  Points d'attention : `navigator.share` (plugin Share), caméra QR
  (plugin Camera si `getUserMedia` insuffisant), stockage (IndexedDB natif
  OK ; possibilité de brancher un backend SQLite derrière `kv*` — c'est
  précisément pour ça que `engine/storage.js` isole les backends).
- **Ordinateur : Tauri** (léger) plutôt qu'Electron. Mêmes fichiers,
  backend `kv*` branchable sur le système de fichiers.
- **Règles à maintenir dès maintenant** (déjà vraies, à ne pas casser) :
  - le moteur ne touche ni DOM ni `window.*` exotiques ;
  - tout accès plateforme (stockage, partage, caméra, réseau P2P) passe
    par un module isolé et remplaçable (`storage.js`, `qr.js`,
    `direct.js`) ;
  - pas d'URL absolues, pas de dépendance à un serveur.

## Protocole de test en classe (étape 1)

1. Deux téléphones, même Wi-Fi : liaison appareils < 30 s ? sync complète ?
2. Deux téléphones, 4G ≠ opérateurs : idem (traversée NAT).
3. Wi-Fi d'établissement : si échec → tester `oc_relays_v1` avec un relais
   auto-hébergé, sinon confirmer que le repli QR/fichier est fluide.
4. Partage en groupe à 5+ : débit, files d'aperçus, doublons après fusions
   croisées (l'idempotence doit tenir).
5. Toujours vérifier après coup : `?test` → tous les auto-tests verts.
