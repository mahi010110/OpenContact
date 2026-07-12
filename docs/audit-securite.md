# OpenContact — audit de sécurité (rapport)

Audit réalisé sur la branche `claude/audit-securite` (depuis `main`, v6.3.0 →
**6.3.1**). Méthode : audit depuis le code, puis correctifs des vraies failles,
tests de non-régression, décisions documentées. Aucune fonctionnalité coupée,
aucun backend, aucune dépendance ajoutée. `?test` : 46 → **51** (5 nouveaux
tests de sécurité), tout vert. Correctif XSS **vérifié en navigateur réel**.

## Modèle de menace

OpenContact est **100 % client** : pas de serveur, pas de compte, données en
IndexedDB / localStorage. Pas de surface serveur (SQLi, auth, SSRF…). Les
risques réels, par ordre d'exploitabilité :

1. **XSS / injection DOM** — du contenu **reçu d'autrui** (fichier `.oc`, QR,
   P2P, coller ; noms, notes, contacts, **ids**) affiché dans la page.
2. **Entrées non fiables** — parsing d'un fichier / QR / presse-papier / pair
   (pollution de prototype, bombe de décompression, bornes de taille).
3. **Chiffrement** — le format `.oc` chiffré (OC2) et les canaux P2P.
4. **Fuites de vie privée** — le seul trafic sortant (géocodage, relais Nostr).
5. **Chaîne d'appro & service worker** — libs vendorisées, cache.

L'appareil est considéré **de confiance** (local-first). Décision explicite
assumée : **IndexedDB n'est pas chiffré au repos** (voir §Décisions).

Légende : **[corrigé]** poussé dans cette branche · **[à trancher]** arbitrage
produit, signalé et proposé · **[info]** constat documenté, sans action.

---

## 🔴 Critique

### C1 — XSS stocké : les `id` atteignaient le DOM sans échappement `[corrigé]`
Fichiers : `ui/pistes.js`, `ui/fiche.js`, `ui/today.js`, `ui/contact.js`,
`ui/prospect.js`, `ui/donner.js`, `ui/direct.js`.

Les noms, villes, notes, liens passaient par `esc()`. Mais les **`id`** de
pistes, contacts et orphelins étaient interpolés bruts dans des attributs
(`data-id="${c.id}"`, `data-ct="${t.id}"`, `data-oid`, `data-attach`). Or
`normalizeCompany` / `normalizeContact` **conservent l'`id` reçu**
(`id: x.id || uid()`). Un `id` du type `"><img src=x onerror=…>` casse
l'attribut et **injecte un nœud HTML**.

Chemins d'attaque **réels** (l'`id` reçu est préservé, pas régénéré) :
- **Restauration d'une sauvegarde `.oc` piégée** — `normalizeCompany` garde les
  `id` de pistes et d'orphelins.
- **Réception communautaire** (Coller / Fichier / QR) — un **contact** reçu
  garde son `id` à la fusion (`merge.js` `ex.contacts.push(nc)`), donc
  `data-ct` est directement atteignable. Rappel : l'app **invite** à coller du
  JSON produit par une IA (« Coup de pouce IA »).
- **Sync appareils** depuis un pair.

Aujourd'hui la CSP (`script-src 'self'`) **empêche l'exécution** du `onerror` —
mais l'injection de balises réussit, et la CSP devient alors le **seul**
rempart. Tout relâchement de la CSP rouvrirait un XSS complet, capable de lire
tout IndexedDB (donc tout le suivi privé) et de l'exfiltrer.

**Correctif** : `esc()` sur **tout** `id` atteignant un attribut. La lecture via
`dataset.*` redécode l'entité, les recherches par `id` continuent de
correspondre — **aucun comportement changé**.
**Vérifié en navigateur** : avec un `id` piégé sur une piste, un contact et un
orphelin, `window.__pwned` reste `null`, **0** nœud `<img>` injecté, la piste
s'affiche et la fiche s'ouvre au clic (aller-retour `data-id` intact).

---

## 🟠 Élevé

### H1 — Pollution de prototype au parsing d'entrées non fiables `[corrigé]`
Fichiers : `engine/utils.js`, `engine/crypto.js`, `engine/exchange.js`,
`engine/model.js`.

`parseInput` faisait `JSON.parse` sur du contenu reçu, puis `keepExtra`
recopiait les **clés inconnues** via `base[k] = x[k]`. Une clé `__proto__`
(ou `constructor`/`prototype`) reçue déclenche alors le setter de prototype.
De plus `keepExtra` partait d'un `Object.assign({}, x.extra)` — `Object.assign`
utilise `[[Set]]`, donc recopiait aussi `__proto__` via son setter. Impact
local (l'objet `extra` visé), mais vecteur classique à fermer sur canal non
fiable.

**Correctif** :
- `safeJSONParse` (réviseur qui **écarte** `__proto__`/`constructor`/`prototype`)
  pour **tous** les parsings d'ingestion : OC2 déchiffré, OC1 déscellé, OCQ1
  décompressé, JSON collé.
- Défense en profondeur : `keepExtra` n'utilise plus `Object.assign` et **saute**
  ces clés (couvre le canal **sync P2P**, qui ne passe pas par `JSON.parse`).

### H2 — Bombe de décompression sur l'OCQ1 (QR / coller) `[corrigé]`
Fichier : `engine/exchange.js`.

`decodeOCQ` faisait `new Response(stream).text()` d'un coup. `parseInput` borne
l'entrée **compressée** à 4 Mo, mais un blob deflate malveillant gonfle d'un
facteur ~1000 → épuisement mémoire / crash de l'onglet en scannant un QR animé
ou en collant une chaîne `OCQ1.…`.

**Correctif** : lecture **par tranches** avec plafond décompressé
(`OCQ_MAX_DECOMPRESSED` = **8 Mo**, large pour 2 000 pistes) ; au-delà, le flux
est **annulé** et `troplourd` est levé (message existant). Test dédié : un blob
minuscule qui décompresse au-delà du plafond est bien rejeté.

---

## 🟡 Moyen

### M1 — Le service worker mettait en cache des réponses `opaque` `[corrigé]`
Fichier : `sw.js`.

La branche `r.type === 'opaque'` visait « les libs CDN sans CORS » — or l'app
n'a **aucun CDN** (invariant), tout est vendorisé même-origine. Cacher de
l'opaque = risque latent d'empoisonnement de cache sans bénéfice.
**Correctif** : ne cacher que `r.ok`. `CACHE` `oc-v11` → `oc-v12`.

### M2 — Géocodage : seule donnée utilisateur envoyée à un tiers `[à trancher]`
Fichier : `engine/geo.js`.

`suggestAddresses` (autocomplétion pendant la saisie d'adresse) envoie l'adresse
tapée à **Nominatim / OpenStreetMap** — le **seul** appel qui expose une donnée
saisie. Déjà **minimal** (uniquement en éditant une adresse), **échoue en
silence** hors ligne, et la CSP restreint `connect-src` à
`nominatim.openstreetmap.org`. `geocodeAddress` est exporté mais **plus appelé**.

**Non corrigé** (arbitrage produit — la phase UX est réservée au mainteneur).
**Proposition** : un interrupteur « suggestions d'adresse en ligne » dans « Moi »,
activé par défaut, stocké dans `profile.flags` (déjà au contrat), consulté par
`ui/edit.js` avant l'appel. Zéro dépendance, dégrade proprement.

---

## 🟢 Faible / informatif

### L1 — CSP durcie `[corrigé partiellement]`
Fichier : `index.html`.
CSP déjà stricte (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`,
`base-uri 'self'`, `connect-src` restreint). Ajout de **`form-action 'self'`**
(valide en `<meta>`, coût nul). `frame-ancestors` (anti-clickjacking) exige un
**en-tête HTTP** — impossible en `<meta>` : à poser côté hébergeur si l'app est
un jour servie. `style-src 'unsafe-inline'` reste **nécessaire** (masques
d'icônes, couleurs dynamiques) — le retirer casserait l'app.

### L2 — OC1 « scellé » n'est pas cryptographique `[info]`
`engine/crypto.js`. OC1 = XOR à graine **publique** + somme **FNV** : ni secret,
ni intégrité forte. Mais présenté comme « scellé — hérité, lecture seule »,
porte uniquement de la donnée **communautaire** (jamais le privé). Conservé pour
rétrocompat. Rien à corriger.

### L3 — Plancher d'itérations PBKDF2 à la lecture OC2 `[info]`
`engine/crypto.js`. `decryptOC2` accepte 10 000–2 000 000 itérations (compat).
Un fichier forgé à 10 000 n'affaiblit que **son propre** brute-force (choisi par
l'émetteur, qui connaît déjà le mot de passe). Écriture toujours à **600 000**.
Conservé pour compat.

### L4 — Libs vendorisées : empreintes désormais consignées `[corrigé]`
`assets/vendor/`. jsQR, qrcode-generator, Trystero — toutes **MIT, licences
présentes**, chargées **localement** (aucun CDN), pas de CVE connue à ce jour.
Ajout de `assets/vendor/VERSIONS.txt` avec les **empreintes SHA-256** de chaque
lib, pour détecter toute altération future.

---

## Chiffrement — vérifié, rien à « corriger »

Le format **OC2** est solide et **n'a pas été touché** (une crypto mal corrigée
est pire que le mal) :
- **AES-GCM 256 bits** (confidentialité **et** intégrité via le tag) ;
- clé dérivée par **PBKDF2-SHA256, 600 000 itérations**, **sel aléatoire 16 o**
  (`crypto.getRandomValues`) — aucune clé en dur ;
- **IV aléatoire 12 o, unique par chiffrement** ;
- contenu altéré ou mauvais mot de passe → rejet (`motdepasse`). *(Nouveau test :
  un octet du chiffré retourné est bien rejeté par le tag GCM.)*

**Canaux P2P** (Trystero) : le canal est **chiffré de bout en bout** par le
secret partagé (`password: phrase` / mot de passe de groupe / code de
rendez-vous) ; le **nom de salle** est un **hash tronqué** du secret
(`sha256('opencontact·'+kind+'·'+phrase).slice(0,24)`) — il ne le révèle pas.
Les relais ne voient que des salles opaques et du chiffré. Conforme au CONTRAT §5.

---

## Décisions explicites (modèle « appareil de confiance »)

- **IndexedDB non chiffré au repos** : assumé. Le chiffrer imposerait un mot de
  passe à chaque ouverture (friction majeure) sans protéger contre l'attaquant
  réaliste (celui qui tient l'appareil déverrouillé a déjà tout). La sauvegarde
  `.oc` exportée, elle, est chiffrable (OC2) — c'est le bon niveau. Pas de
  théâtre de sécurité.
- **Le privé ne fuit pas** : `communityView` / `sharePayload` excluent par
  construction les champs privés **et l'`id`** ; la fusion remet à `todo`, vide
  notes/dates, rétrograde `conf:"ok"`→`"doubt"`. Couvert par les tests de contrat.

## Ce qui reste à la main du mainteneur

1. **M2** — rendre les suggestions d'adresse désactivables (proposition ci-dessus),
   à faire pendant ta passe UX.
2. **L1** — poser un en-tête `Content-Security-Policy` avec `frame-ancestors`
   (et éventuellement HSTS) **si** l'app est servie par un hébergeur.
3. **L4** — mettre à jour `VERSIONS.txt` (empreinte + licence) à chaque montée
   de version d'une lib.
