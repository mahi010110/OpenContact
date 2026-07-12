# OpenContact — audit de sécurité (spec pour Fable 5)

Objectif : passer l'app au crible **sécurité**, corriger les vrais problèmes, ajouter des tests de non-régression, **documenter** ce qui a été trouvé et décidé. Aucune fonctionnalité coupée, aucun backend introduit, aucune nouvelle dépendance.

Avant de commencer : lis ce doc + `CLAUDE.md` + `CONTRAT.md`. Puis **audite d'abord** (rapport), **corrige ensuite**, en présentant les trouvailles classées par gravité avant de patcher les grosses. Garde `?test` vert (46/46) et **ajoute** des tests pour le chiffrement et la validation des entrées.

## Modèle de menace (ce qu'on protège, contre quoi)

OpenContact est **100 % client** : pas de serveur, pas de compte, données en IndexedDB/localStorage sur l'appareil. Donc **pas** de failles serveur (SQLi, auth, SSRF…). Les vrais risques sont :

1. **XSS / injection** — du contenu **reçu d'autrui** (pistes via QR / fichier `.oc` / P2P / coller ; noms d'entreprise, notes, champs contact, prompts) affiché dans le DOM.
2. **Chiffrement** — le format `.oc` chiffré (AES) et le chiffrement des canaux P2P.
3. **Données non fiables** — tout ce qui vient d'un pair, d'un fichier ou du presse-papier.
4. **Chaîne d'appro** — les libs vendorisées.
5. **Fuites de vie privée** — le seul trafic sortant (géocodage, relais).

L'appareil lui-même est considéré **de confiance** (local-first) — inutile de chiffrer IndexedDB au repos, mais **note-le** comme décision explicite.

## Périmètre à auditer (par surface)

### 1. XSS — la priorité n°1
- Recense **tous les points d'injection DOM** : `innerHTML`, `insertAdjacentHTML`, `outerHTML`, attributs `on*`, `href`/`src` dynamiques.
- Vérifie que **toute donnée d'origine externe** passe par `esc()` (ou équivalent) avant d'atteindre le DOM. La référence de « bon » code existe déjà (`esc()` dans `ui/dom.js`, la validation dans `openPromo`) — rends-la **systématique**, sans trou.
- Vérifie la **robustesse d'`esc()`** (guillemets, `<`, `>`, `&`, contextes attribut vs texte).
- Recommande/ajoute une **CSP stricte** dans `index.html` (pas de source externe, limiter l'inline) — la meilleure défense en profondeur contre le XSS pour une app client.

### 2. Chiffrement (`.oc` + canaux P2P)
- **Format `.oc` chiffré** (`engine/exchange.js`, OC2) : algorithme (viser **AES-GCM**, jamais ECB ni CBC sans MAC), **dérivation de clé** depuis le mot de passe (**PBKDF2/scrypt** avec sel aléatoire + itérations suffisantes, jamais de clé brute), **IV/nonce aléatoire unique** par chiffrement (`crypto.getRandomValues`), **authentification** (tag GCM) contre l'altération. Aucune clé/sel en dur.
- **Canaux P2P** (sync appareils, salle de groupe, QR rendez-vous OCR1) : les données doivent être **chiffrées de bout en bout** pour que **les relais Nostr ne lisent rien**. Vérifie que la clé dérive du secret partagé (phrase de liaison / mot de passe de groupe / code de rendez-vous) et que le **nom de salle** (hash) ne fuit pas ce secret.
- **Ajoute des tests** : round-trip chiffrer/déchiffrer, rejet d'un mauvais mot de passe, rejet d'un contenu altéré.

### 3. Entrées non fiables (fichier, QR, coller, pair)
- **Parsing sûr** : bornes de taille, `JSON.parse` protégé contre la **pollution de prototype** (`__proto__`, `constructor`, `prototype` comme clés) — surtout dans `merge.js` qui fusionne des objets reçus.
- **Bombe de décompression** : `DecompressionStream` (OCQ1/QR animé) sur un blob malveillant peut exploser en mémoire → borne la taille décompressée.
- **ReDoS** : pas de regex coûteuse sur entrée non fiable.
- Tout contenu reçu reste soumis à l'**aperçu avant fusion** (`mergePreviewInto`) et à la validation (type, `name` présent, `.slice` de borne) — vérifie qu'aucun canal ne contourne ça.

### 4. Chaîne d'approvisionnement (libs vendorisées)
- Chaque lib de `assets/vendor/` : **version épinglée et connue**, **non modifiée**, **licence présente**, **pas de CVE connue** sur cette version, **chargée localement** (aucun CDN — invariant). Note toute lib obsolète.

### 5. Fuites de vie privée (trafic sortant)
- **Géocodage** (`engine/geo.js`, Nominatim) : c'est **le seul appel qui envoie des données de l'utilisateur** (nom/ville d'entreprise) à un tiers → révèle quelles boîtes il vise. Vérifie que c'est **opt-in / minimal**, échoue en silence, et **documente-le**. Propose de le rendre désactivable.
- **Relais Nostr** : métadonnées exposées (noms de salle hashés). Confirme qu'aucun contenu privé ne transite en clair.
- Confirme **zéro analytics / télémétrie / police ou ressource externe** (invariant) — cherche tout `fetch`/`XHR`/`<link>`/`@import` sortant inattendu.

### 6. Service worker & cache
- `sw.js` : portée correcte, pas de mise en cache de données sensibles de façon exploitable, pas de risque d'empoisonnement de cache.

## Ce qu'il faut corriger vs seulement signaler

- **Corrige** tout ce qui est réellement exploitable (XSS, faiblesse crypto réelle, pollution de prototype, bombe de décompression, fuite de privé).
- **Signale + propose** (sans forcément coder) ce qui relève d'un arbitrage produit (chiffrer IndexedDB au repos, rendre le géocodage désactivable) — laisse le mainteneur trancher.
- **Pas de théâtre de sécurité** : rien qui ajoute de la friction sans bénéfice réel sous le modèle « appareil de confiance ».

## Bornes

Aucune fonctionnalité coupée. Aucun **backend**, aucun **compte**, aucune **nouvelle dépendance** (vanilla JS, tout local). Ne casse pas les formats `.oc` existants (rétrocompat). `?test` reste vert + nouveaux tests sécurité. `CONTRAT.md` à jour si un format/invariant bouge. `sw.js` bumpé si un fichier précaché change.

## Livrable

1. `docs/audit-securite.md` — **rétablis-le en rapport** : le modèle de menace, les trouvailles **classées par gravité** (critique / élevé / moyen / faible), et pour chacune : corrigée / signalée-à-trancher, avec le fichier concerné.
2. Les **correctifs** en commits dédiés, en français.
3. Les **tests** de sécurité ajoutés (chiffrement, validation d'entrée).

## Méthode

Audite d'abord, montre-moi les trouvailles classées par gravité **avant** de patcher les grosses (une faille crypto mal corrigée est pire que le mal). Vérifie chaque correctif en lançant réellement l'app (`?test` vert, zéro erreur console). Priorise par exploitabilité réelle, pas par longueur de checklist.
