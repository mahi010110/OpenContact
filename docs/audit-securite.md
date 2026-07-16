# OpenContact — audit de sécurité (rapport)

Audit réalisé sur la v6.3 par Fable 5 (juillet 2026), selon la spec du
mainteneur : passer l'app au crible sécurité, corriger le réel, tester,
documenter. Résultat : **4 corrections** (toutes couvertes par des
auto-tests, `?test` = 51/51 vert), **zéro fonctionnalité coupée, zéro
dépendance ajoutée**, et une liste d'arbitrages laissés au mainteneur.

## Modèle de menace (rappel)

OpenContact est 100 % client : pas de serveur, pas de compte. Les surfaces
réelles sont ① le contenu **reçu d'autrui** (QR, fichier `.oc`, P2P,
coller) affiché dans le DOM ou fusionné dans les données, ② le
**chiffrement** (`.oc` chiffré, canaux P2P), ③ la **chaîne d'appro**
(libs vendorisées), ④ les **fuites de vie privée** (trafic sortant).
L'appareil lui-même est **de confiance** — décision explicite : IndexedDB
n'est pas chiffré au repos, un attaquant qui tient l'appareil tient les
données (comme pour n'importe quelle app locale).

## Trouvailles corrigées

### S1 — Bombe de décompression (élevé) — `engine/exchange.js`
`decodeOCQ` (QR compact OCQ1) décompressait sans borner la sortie : un
collage ou un QR de quelques Ko pouvait gonfler en centaines de Mo et
geler l'onglet. **Corrigé** : lecture en flux, bornée à 4 Mo décompressés
(même borne que l'entrée, D4) → refus `troplourd`. Testé avec une vraie
bombe (4,2 Mo compressés en ~4 Ko).

### S2 — Injection HTML par les `id` (élevé) — `engine/model.js`
Les `id` de pistes et de contacts finissent en attribut DOM
(`data-id="…"`) **sans échappement** dans plusieurs écrans. Un `.oc`
« full » restauré ou une sync d'appareil pouvait porter un id du type
`"><img …>` et casser le HTML (la CSP bloque l'exécution de script, mais
pas l'injection de balises). **Corrigé à la racine** : `normalizeCompany`
/ `normalizeContact` n'acceptent qu'un jeton sobre
(`[A-Za-z0-9._-]{1,64}`) et régénèrent tout le reste. Les ids légitimes
(`uid()`) passent inchangés — aucune donnée existante n'est touchée.

### S3 — Injection HTML par les dates (élevé) — `engine/model.js`
`frDate()` retourne la chaîne brute quand la date est invalide, et
« Aujourd'hui » / la fiche l'injectent sans `esc()`. Une `nextAction`
piégée (portée par une restauration ou une sync) devenait de l'HTML.
**Corrigé à la racine** : `nextAction`, `appliedAt`, `closedAt`,
`verifiedAt` sont validées à la normalisation — seule la forme
`AAAA-MM-JJ` passe (un horodatage complet est tronqué au jour, le reste
est vidé).

### S4 — Pollution de prototype (moyen) — `engine/model.js`, `engine/sync.js`
- `keepExtra` et `normalizeProfile` recopiaient les clés inconnues d'un
  JSON reçu (dont `__proto__`, que `JSON.parse` crée en propriété
  propre) via affectation / `Object.assign` → détournement du prototype
  de l'objet local. **Corrigé** : les clés `__proto__` / `constructor` /
  `prototype` sont ignorées à la copie.
- Les maps indexées par id de `syncMerge` / `mergeTombs` (`byId`,
  `dead`, …) sont passées en `Object.create(null)` : un id littéralement
  `__proto__` reste une simple donnée.

`Object.prototype` global n'était jamais atteignable (pas de deep-merge
récursif), mais le comportement était indéfini — il est maintenant testé.

### Corollaire fiabilité — tombstones et sauvegarde — `ui/moi.js`
Découvert pendant l'audit : la sauvegarde `.oc` n'emportait pas les
tombstones et la restauration ne les remettait pas à zéro — une piste
restaurée pouvait être **re-supprimée en silence** à la sync suivante par
une vieille pierre tombale. **Corrigé** : la sauvegarde inclut `tombs`
(champ optionnel déjà prévu au contrat), la restauration repart des
tombstones du fichier (ou d'une liste vide), l'Annuler ~30 s les
restaure aussi.

## Vérifié sain (rien à corriger)

- **XSS par les champs texte** : tous les contenus d'autrui affichés
  passent par `esc()` (complet : `& < > " '`) ; les liens par `safeUrl`
  (http(s) seulement) ; `webHref` ne peut pas produire de `javascript:`.
  La **CSP** de `index.html` (script-src 'self', object-src 'none',
  base-uri 'self') reste le filet de fond.
- **Chiffrement OC2** : AES-GCM 256, PBKDF2-SHA256 600 000 itérations,
  sel 16 o + IV 12 o aléatoires par chiffrement, authentification par tag
  GCM (altération = refus, testé), aucune clé en dur. Conforme à l'état
  de l'art pour un format par mot de passe.
- **Canaux P2P** : la salle porte un hash SHA-256 (préfixe + phrase) —
  le secret ne s'en déduit pas ; Trystero chiffre la signalisation avec
  la phrase et les données passent en WebRTC (DTLS). Les relais Nostr ne
  voient qu'un nom de salle opaque.
- **OC1 hérité** : scellé faible (fnv + XOR) mais **lecture seule**, plus
  jamais émis. À conserver tel quel pour la compat.
- **Garde-fous d'entrée** : 4 Mo max, 2 000 pistes max, entrées sans
  `name` ignorées, `conf:"ok"` reçu dégradé en `"doubt"`, aperçu avant
  fusion sur **tous** les canaux (fichier, QR, coller, P2P) — vérifié.
- **Service worker** : même-origine seulement en pratique, géocodage et
  tuiles jamais mis en cache, pas de vecteur d'empoisonnement identifié.
- **Zéro télémétrie / ressource externe** : le seul `fetch` sortant est
  Nominatim (voir ci-dessous) ; polices, icônes et libs sont locales.
- **Libs vendorisées** : jsQR (Apache-2.0), qrcode-generator 1.x (MIT),
  trystero-nostr (MIT) — licences présentes, chargées localement, à la
  demande. Pas de CVE connue sur ces usages (générer/lire des QR, salon
  WebRTC). À re-vérifier à chaque mise à jour.

## Arbitrages laissés au mainteneur (signalés, pas codés)

1. **Géocodage Nominatim** (`engine/geo.js`) : les suggestions d'adresse
   partent **pendant la frappe** (dès 4 caractères) vers
   openstreetmap.org — c'est le seul trafic qui révèle quelles
   entreprises l'utilisateur vise. C'est déclenché par une saisie
   volontaire et ça échoue en silence, mais un réglage « désactiver le
   géocodage » (ou n'interroger qu'au blur) serait plus sobre. À trancher.
2. **Chiffrement au repos** d'IndexedDB : non fait, par décision (modèle
   « appareil de confiance », pas de mot de passe maître à retenir).
   À reconsidérer seulement si le produit change de public.
3. **`connect-src wss:` large dans la CSP** : nécessaire tant que les
   relais sont personnalisables (`oc_relays_v1`). Une liste fermée de
   relais durcirait la CSP mais casserait cette fonctionnalité.

## Deuxième passe (durcissements complémentaires)

- **CSP** : `form-action 'none'` (aucun formulaire ne soumet — un `<form>`
  injecté ne peut plus exfiltrer) et `frame-src 'none'` ajoutés.
- **`<meta name="referrer" content="no-referrer">`** : les liens sortants
  (sites d'entreprises, LinkedIn, itinéraires, wa.me) ne disent plus d'où
  ils viennent.
- **Canaux P2P communautaires** (partage en groupe, QR de rendez-vous) :
  même borne de 4 Mo que par fichier (D4) sur les payloads reçus — le
  transport n'était pas borné, seul le fichier l'était. Le dédoublonnage
  du partage en groupe retient une empreinte (fnv + taille), plus le JSON
  entier (30 envois retenus ne doivent pas peser 120 Mo).
- La sync « Mes appareils » reste volontairement non bornée : les deux
  côtés sont à la même personne (canal de confiance).

## Tests ajoutés (`tests.js`, section sécurité)

- OC2 : contenu altéré (octet retourné) → refusé par le tag GCM ;
- OCQ1 : bombe de décompression → `troplourd` ;
- ids piégés régénérés / ids normaux gardés (S2) ;
- dates piégées vidées / ISO tronquée au jour (S3) ;
- `__proto__` en clé (piste, extra, profil, sync) = donnée ignorée,
  `Object.prototype` intact (S4).
