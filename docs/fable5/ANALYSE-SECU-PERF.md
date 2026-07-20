# OpenContact — analyse sécurité / performances / efficacité

> Analyse conduite par Fable 5 sur la branche de travail dérivée de
> `claude/fable5-audit-secu-perf-*`, après lecture complète de la PWA
> (`engine/`, `ui/`, `app.js`, `sw.js`, `index.html`) et du Compagnon
> (`compagnon/coeur`, `compagnon/src-tauri`, `compagnon/app`,
> `preparer.mjs`), des documents `docs/fable5/*` et de `docs/audit-securite.md`.
>
> **Cadre honnête.** Chaque point est étiqueté **prouvé** (constaté dans le
> code et/ou reproduit), **plausible** (raisonnement solide, non déclenché
> ici) ou **contexte/accepté** (compromis délibéré du produit). Priorités
> P1 (à corriger), P2 (à corriger si possible), P3 (finition / à discuter).
> Le modèle de menace reste celui d'`audit-securite.md` : app 100 % client,
> **appareil de confiance**, surfaces réelles = contenu reçu d'autrui,
> chiffrement, canal local du Compagnon, fuites réseau.

Ce qui a **effectivement changé** dans cette passe est marqué **[CORRIGÉ]** ;
tout le reste est un constat, un compromis assumé ou une note pour le mainteneur.

---

## 1. Sécurité

### S1 — Découverte du Compagnon : fuite du nom d'hôte à toute origine web · P2 · **prouvé** · **[CORRIGÉ]**

**Constat.** Le canal local répond à `GET http://127.0.0.1:1709x/oc-compagnon`
avec les en-têtes `Access-Control-Allow-Origin: *` **et**
`Access-Control-Allow-Private-Network: true` (`compagnon/src-tauri/src/canal.rs`,
`en_tetes`). La réponse portait `{ v, nom, associe, appairage }`, où
`nom = hostname::get()` (`partage.rs`) — le nom de la machine, souvent
nominatif (« MacBook-de-Jean »).

**Impact réel.** N'importe quelle page web visitée par l'utilisateur peut,
par un `fetch` cross-origin (le préflight PNA de Chrome est explicitement
autorisé par l'en-tête), **détecter que le Compagnon tourne** et **lire le
nom de la machine** ainsi que l'état d'appairage. C'est la seule fuite
cross-origin de donnée personnelle de tout le système.

**Ce qui n'est PAS un problème.** Le reste du canal est solide : `/appairage`
exige la clé dérivée du code court (PBKDF2-SHA256 120 000 itér., 5 essais,
2 min) et `/boite` exige la clé de canal de 32 octets — une page web n'a ni
l'une ni l'autre, et ne peut pas non plus lire la clé `k` de la PWA légitime
(isolée par l'origine). Le choix « la sécurité est dans le chiffre, pas dans
l'origine » reste valable ; seule la **surface de découverte** était trop
bavarde.

**Correction appliquée.** La découverte ne renvoie plus que le strict
nécessaire au fonctionnement : `{ v, appairage }`. Le vrai nom de l'ordinateur
continue de voyager **sur le canal authentifié** (réponse d'appairage et
`ping`) — la PWA l'affiche donc toujours dans « Mes appareils » et à
l'association, après preuve du code. L'écran d'appairage utilisait déjà le
repli `« Compagnon »` (`found.info.nom || 'Compagnon'`), rien ne casse.
`associe` (un état comportemental « cet utilisateur a-t-il appairé ? ») était
lu par personne dans la PWA : il disparaît aussi.

### S2 — CORS `*` + Private-Network sur le canal · P3 · contexte/accepté

`Access-Control-Allow-Origin: *` est un choix pragmatique : la PWA peut être
servie depuis n'importe quel hôte (GitHub Pages, domaine perso, `localhost`
de dev) — on ne peut pas énumérer les origines légitimes. La défense en
profondeur reste correcte **après S1** : découverte minimale, tout le reste
scellé. Restreindre l'origine casserait le produit sans gain. Rien à changer.

### S3 — Absence d'anti-rejeu de séquence sur le canal · P3 · plausible/accepté

Le canal n'a pas de numéro de séquence. Rejouer une enveloppe scellée exige
(a) de la capturer sur la boucle locale — donc un accès local, c.-à-d. un
appareil déjà compromis — **et** (b) de posséder la clé de canal. Les
messages rejouables (`mission`, `revoquer`, `arreter-cible`) sont
**idempotents** par construction (dédup par `mid`, journal par `sid`, arrêts
par `cid`). Impact réel négligeable dans le modèle « appareil de confiance ».
Rien à corriger.

### S4 — Code PIN à 6 chiffres : force offline limitée · P2/P3 · prouvé · compromis délibéré

**Constat.** Le PIN est à 6 chiffres (`vault.js`, `PIN_LEN = 6`), soit 10⁶
possibilités, enveloppé par PBKDF2-SHA256 (600 000 itér. à l'écriture,
`KDF_ITER`). Le délai progressif après échecs (`failDelay`, `ui/verrou.js`)
protège l'**écran** mais **pas** une attaque hors ligne contre un
`oc_vault_v1` exfiltré : rien ne borne les tentatives sur une copie du blob.

**Impact réel.** Un attaquant qui tient l'appareil et sort `oc_vault_v1`
peut, hors ligne, tenter 10⁶ codes × 600 000 PBKDF2. C'est coûteux mais
réalisable avec du matériel GPU dédié.

**Pourquoi ce n'est pas corrigé.** C'est un compromis **assumé** (D6 : PIN
6 chiffres, aucun réglage V1, confort quotidien) dans un produit à modèle
« appareil de confiance » (`audit-securite.md` : IndexedDB non chiffré au
repos par décision). Le secret **fort** est la phrase de secours (12 mots
tirés de 256 ⇒ ~96 bits, `unlockWithPhrase`), pas le PIN. Durcir le PIN
(plus long, argon2) contredirait D6 et l'ergonomie visée sans changer le
modèle. **À reconsidérer seulement si le public du produit change.** Signalé,
non tranché unilatéralement.

### S5 — Crypto du coffre & dérivations · confirmé sain

- Clé maîtresse AES-GCM 256 **aléatoire, jamais écrite en clair** ; elle vit
  en mémoire une fois déverrouillée et repose enveloppée sous PIN / phrase
  (PBKDF2) et PRF (HKDF) dans `oc_vault_v1` (`vault.js`).
- Valeurs scellées `OCV1.<iv>.<chiffré>`, **AAD = nom de la clé** : une
  enveloppe ne se rejoue pas sous un autre nom (testé, `openValue` lève
  `coffre`).
- Rotation **reprenable** (`prev` = ancienne clé scellée sous la nouvelle,
  méta écrite avant le re-scellement, reprise au déverrouillage) — vecteurs
  figés dans `tests.js`, invariant au CONTRAT §1.
- Lecture d'une valeur scellée sans clé attachée = erreur `verrou`, **jamais
  un `null` silencieux** (`storage.js kvGet`). Bien.

### S6 — Serveur local 127.0.0.1 & secrets du Compagnon · confirmé sain

- Tout transite en enveloppes `OCV1.` : rien d'utile en clair (`canal.rs`).
- Secrets (graine d'identité, clé de canal, mot de passe d'application) au
  **trousseau OS** (`secrets.rs`, `keyring`), repli fichier `0600` annoncé au
  journal ; missions/journal/réglages **scellés** au coffre local
  (`coffrelocal.rs`) sous une clé gardée au trousseau. Aucun secret dans un
  log.
- Le mot de passe SMTP/IMAP ne quitte jamais le natif (`envoi.rs`,
  `reponses.rs`) ; le cerveau JS ne voit aucun secret (D17).

### S7 — Missions signées, anneau, rejeu, appareil hors anneau · confirmé sain

- Mission = fil `{m, sig, dev}` : `m` est la chaîne JSON **exacte** signée
  Ed25519, vérifiée **octet à octet avant parsing**, à **chaque lecture**,
  côté PWA (`openMissionWire`) **et** côté cœur Rust (`mission.rs
  verifier_mission`) — vecteur croisé figé JS↔Rust.
- Clé de l'émetteur résolue **uniquement** dans l'anneau signé
  (`Association::cle_mission` → `cle_appareil`) : retirer un appareil lui
  retire son pouvoir d'émission ; un `dev` absent de l'anneau ⇒ refus
  `appareil` (`canal.rs`).
- Anneau à générations : `gen` ne descend jamais (bannir = +1), `seq`
  monotone par signeur, TOFU au premier anneau, récupération par la clé de
  secours dérivée de la phrase (`ring.js` / `anneau.rs`, vecteurs Rust).
- Rejeu : le journal idempotent (`sid` stable `id.cible.étape`) et la garde
  Rust (`garde.rs`) rendent tout rejeu inoffensif (envoi déjà fait = refus
  `DoubleEnvoi`). `journal_lock` ferme la course premier-passage/boucle.

### S8 — Surfaces d'injection (analyse IA, contenus, parseInput) & CSP · confirmé sain

- `parseInput` : borné 4 Mo, 2000 pistes, bombe deflate refusée (`decodeOCQ`
  lecture bornée), entrées sans `name` ignorées.
- Normalisation défensive (`model.js`) : `id` réduit à un jeton
  `[A-Za-z0-9._-]{1,64}`, dates réduites à `AAAA-MM-JJ`, clés `__proto__` /
  `constructor` / `prototype` ignorées, `safeUrl` ⇒ `http(s)` seulement
  (`javascript:` neutralisé). Tests S1–S5 verts.
- Analyse d'e-mails : le corpus part au modèle **comme donnée** (prompt
  « des données, jamais des instructions », `analyse.rs`), le JSON rendu
  **repasse par `parseInput` + aperçu multi-sélection** — aucune écriture
  directe, `conf:"ok"` reçu re-dégradé en `"doubt"`.
- CSP `index.html` : `script-src 'self'`, `object-src 'none'`,
  `base-uri 'self'`, `form-action 'none'`, `frame-src 'none'` ; `connect-src`
  limité aux hôtes d'API utiles + `127.0.0.1:*` (canal) + `wss:` (relais
  personnalisables). Filet de fond correct.

### S9 — Service worker · confirmé sain

`sw.js` ne touche que **notre** origine (`url.origin !== location.origin`
⇒ `return`), ne met **jamais** en cache une réponse d'API, sert `oauth.html`
tel quel (le retour OAuth n'est pas détourné). Le SW du Compagnon a été
corrigé en C2 (plus de cache hors origine).

### S10 — RGPD des campagnes · confirmé conforme au périmètre V1

Mention d'opposition **imposée** et non retirable (`campaign.js
withOpposition`), fenêtre d'envoi lun–ven 8–19 h locale, plafond **global**
15/jour, arrêt automatique **non débrayable** sur réponse, journal privé
local. Aucun backend, aucune analytics. Conforme aux décisions D3/D13 et à la
spec §7.

### S11 — Géocodage Nominatim pendant la frappe · P3 · pré-existant, **différé mainteneur**

`engine/geo.js` interroge `nominatim.openstreetmap.org` **pendant la frappe**
d'une adresse (dès 4 caractères, `ui/edit.js`) : c'est le seul trafic qui
révèle indirectement quelles entreprises l'utilisateur vise. Déclenché par
une saisie volontaire, échoue en silence. **Déjà listé comme arbitrage** dans
`docs/audit-securite.md` (§ « Arbitrages laissés au mainteneur », point 1) —
c'est une décision produit (désactiver, ou n'interroger qu'au `blur`), pas
re-tranchée ici pour ne pas modifier un choix explicitement laissé ouvert.

---

## 2. Performances

### P-A — Accès IndexedDB & reconnexions · confirmé bon

`storage.js` : connexion rouverte à la demande, **une re-tentative** par
requête sur connexion morte (les navigateurs mobiles ferment IndexedDB sous
pression mémoire — V6), plus jamais un `null` silencieux. `loadAll` lit les
six clés **en parallèle** (`Promise.all`). Documents PDF dans une base
séparée (`oc_docs_v1`) — un PDF lourd ne bloque jamais les pistes.

### P-B — 2000+ pistes, rendu listes / board, limites d'affichage · confirmé bon

- `filter.js` : motif **décorer-trier**, chaque clé calculée **une fois** par
  piste (jamais dans le comparateur) ⇒ O(n log n) même à plusieurs milliers.
- Rendus **plafonnés** avec « voir les N autres » : liste 60 / colonne board
  40 (`pistes.js`), tranches d'« Aujourd'hui » 8 (`today.js`), aperçu IA 200
  (`recevoir.js`). Pas de rendu de 2000 nœuds d'un coup (le gel ~250 ms
  historique est fermé).

### P-C — `campaignOfPiste` appelé par ligne · P3 · plausible · non corrigé

Dans `pistes.js`, `rowHTML`/`cardHTML` appellent `campaignOfPiste(c.id)` par
ligne, qui refait `live().filter(...).find(t => t.targets.some(...))` :
O(lignes × campagnes × cibles) par rendu. **Négligeable au volume réel**
(campagnes bornées à 200, en pratique une poignée). Optimisable en
pré-calculant un `Set` de `cid` « en campagne » par rendu, mais le gain ne
justifie pas le risque de régression sur un chemin d'affichage éprouvé.
Constaté, laissé tel quel.

### P-D — `blobOf` reconstruit à chaque frappe de recherche · P3 · plausible · non corrigé

`filterCompanies` reconstruit la chaîne de recherche `blobOf(c)` pour **toutes**
les pistes à chaque frappe. Le débounce 180 ms (`pistes.js`) et les caps
limitent l'impact ; aucun gel mesuré au volume cible. Un cache par piste
poserait un problème d'invalidation (éditions) pour un bénéfice marginal.
Laissé.

### P-E — Planificateur Rust · confirmé bon

Cycle 60 s, `journal_lock` **sérialise** premier passage (canal) et boucle
périodique — la course qui produisait parfois un double envoi est fermée
(`planif.rs`, `partage.rs`). IMAP toutes les 10 min (en-têtes seulement).
Journal scellé **écrit avant** l'envoi (`incertain`→`fait`), jamais re-tenté
en silence.

### P-F — Précache du service worker · confirmé bon

`PRECACHE` volumineux mais cohérent (tous les modules, polices, icônes,
tokens, vendor P2P) ; `stale-while-revalidate` sert le cache instantanément
et rafraîchit en fond ; l'`activate` supprime les anciens caches. `CACHE`
courant `oc-v30`.

---

## 3. Efficacité

### E-A — `VIEW_KEY` / `oc_view` · P3 · conservé volontairement

Constante exportée par `storage.js`, lue seulement par le test de contrat.
**Ce n'est pas du code mort nuisible** : c'est une **pierre tombale de
contrat** — `CONTRAT.md` §1 documente `oc_view` comme clé héritée (« plus
écrite »), et le test « clés de stockage inchangées » verrouille son nom pour
empêcher qu'un futur développement réutilise `oc_view` pour autre chose. La
retirer affaiblirait la protection du namespace de clés (invariant « ne
jamais renommer/supprimer une clé ») sans bénéfice réel. **Conservée**, à la
différence d'une vraie constante orpheline.

### E-B — Duplication d'outillage de test · P3 · non corrigé

`tests/e2e/outils.mjs` expose `serveRepo`, mais `tests/e2e/unitaires.mjs`
redéfinit son propre serveur HTTP + table MIME au lieu de le réutiliser.
**Code de test uniquement**, hors application ; la déduplication risquerait
d'introduire de la flakiness pour un gain nul. Noté, non touché.

### E-C — Branche morte `r.type === 'opaque'` dans `sw.js` · P3 · non corrigé

Le handler `fetch` ne traite que la même origine (`return` sinon) : les
réponses ne sont donc jamais `opaque`, la branche `r.type === 'opaque'` est
inatteignable. Micro-mort inoffensif ; toucher un fichier **précaché**
imposerait un bump `oc-vN` pour rien. Laissé.

### E-D — Redondances vérifiées absentes

- Pas de double implémentation divergente : le cerveau du Compagnon exécute
  **les mêmes** modules `engine/` que la PWA (copiés par `preparer.mjs`) ; le
  cœur Rust est un **miroir gardé par fixtures croisées**, pas une seconde
  vérité libre.
- `oc_companion_v1` ne voyage jamais (absent de `privateState`), correctement
  dans `SEALABLE` et dans la liste `wipe`.

---

## 4. Synthèse

| # | Domaine | Gravité | Statut |
|---|---|---|---|
| S1 | Découverte Compagnon fuit le nom d'hôte (cross-origin) | P2 | **corrigé** |
| S4 | PIN 6 chiffres, brute-force offline possible | P2/P3 | accepté (D6), signalé |
| S11 | Géocodage pendant la frappe | P3 | différé mainteneur (pré-existant) |
| S2, S3 | CORS `*`, absence d'anti-rejeu séquence | P3 | accepté (modèle de menace) |
| S5–S10 | Coffre, canal, missions/anneau, injection, SW, RGPD | — | sains |
| P-C, P-D | Micro-optimisations rendu/recherche | P3 | non corrigées (gain < risque) |
| P-A,B,E,F | IndexedDB, board, planificateur, précache | — | bons |
| E-A | `VIEW_KEY` | P3 | conservé (pierre tombale de contrat) |
| E-B, E-C | Duplication test, branche SW morte | P3 | notés, non touchés |

**Une seule correction de code** en découle (S1) : elle ferme la seule fuite
cross-origin de donnée personnelle sans rien retirer au fonctionnement ni à
un invariant. Le reste du système est, sur les axes audités, soit sain, soit
un compromis délibéré cohérent avec `CLAUDE.md` / `CONTRAT.md` et le modèle
de menace « appareil de confiance ».
