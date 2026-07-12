# Le contrat de données d'OpenContact

Ce document fige ce qui ne doit **jamais** casser, quelle que soit la refonte
de l'interface. Tant que les quatre sections ci-dessous sont respectées, un
utilisateur peut changer de version sans perdre une donnée, et un fichier
`.oc` circule entre versions différentes sans accroc.

Ce contrat est **exécutable** : ouvrir l'app avec `?test` dans l'URL fait
tourner les auto-tests (`tests.js`), qui vérifient chaque point ci-dessous.
Une modification qui fait passer un test au rouge casse le contrat — elle
doit être repensée, pas forcée.

---

## 1. Les clés de stockage (navigateur) — intouchables

| Clé | Contenu | Format |
|---|---|---|
| `oc_data_v3` | Les pistes (partagé + suivi privé) | JSON : tableau de pistes |
| `oc_profile_v1` | Profil, modèles d'emails, prompts IA (8 × 4 000 car. max), fiches confirmées, flags, `updatedAt` (LWW appareils) | JSON : objet profil |
| `oc_journal_v1` | Journal privé des actions (200 max) | JSON : tableau `{t, txt, cid}` |
| `oc_orphans_v1` | Contacts « à rattacher » (sans entreprise) — l'indice d'entreprise saisi par l'utilisateur voyage dans `extra.company` (D3), consommé au rattachement | JSON : tableau de contacts |
| `oc_tombs_v1` | Suppressions (tombstones, 500 max) — font voyager les suppressions entre MES appareils | JSON : tableau `{id, t}` |
| `oc_sync_v1` | Phrase de liaison de mes appareils | chaîne |
| `oc_relays_v1` | Relais P2P personnalisés (optionnel — vide = relais publics) | JSON : tableau d'URLs |
| `oc_device_v1` | Cet appareil — identité annoncée à la sync | JSON : `{id, name}` |
| `oc_devices_v1` | Appareils reliés déjà vus (12 max, consultables et élagables) | JSON : tableau `{id, name, seen}` |
| `oc_promo_v1` | Dernier mot de passe de partage en groupe (confort de saisie) | chaîne |
| `oc_theme` | `light` ou `dark` | chaîne |
| `oc_view` | `map`, `list` ou `grid` (héritée, plus écrite) | chaîne |
| `oc_data_v2`, `ais_stage_targets_v1` | Anciennes clés (v1/v2), lues une seule fois pour migration | lecture seule |

Depuis la v6.1, ces clés vivent dans **IndexedDB** (base `oc_kv_v1`, magasin
`kv`) avec les **mêmes noms** ; `localStorage` reste lu en repli, ce qui migre
automatiquement les données existantes sans les toucher. L'ordre des backends :
`window.storage` → IndexedDB → localStorage → mémoire.

Les PDF (CV, lettre) vivent dans **IndexedDB** : base `oc_docs_v1`, magasin
`docs`, clés `cv` et `lettre` — séparés exprès des pistes pour qu'un document
lourd ne puisse jamais les bloquer ni les faire perdre.

Renommer une clé = perte de données pour tous les utilisateurs existants.
On ne renomme jamais ; si le format d'une clé doit évoluer, on crée une
**nouvelle** clé versionnée et on migre à la lecture (comme v1 → v2 → v3).

## 2. Le format `.oc` — intouchable

### L'enveloppe (JSON)

```json
{ "v": 4, "app": "5.0.0", "kind": "share", "companies": [] }
{ "v": 4, "app": "5.0.0", "kind": "full",  "profile": {}, "companies": [] }
```

- `v` : version du **format** (4). `app` : version de l'application émettrice
  (informatif).
- `kind: "share"` : pistes en **vue communautaire** (voir §3) — jamais de
  champ privé, jamais de profil.
- `kind: "full"` : sauvegarde personnelle complète — pistes avec suivi privé,
  plus le profil, plus les champs **optionnels** `orphans` (contacts « à
  rattacher ») et `tombs` (suppressions) s'il y en a. Un lecteur qui les
  ignore charge quand même le reste sans erreur.
- Tolérance à la lecture : un simple tableau JSON de pistes est aussi accepté.

### Compact — OCQ1 (échange par QR)

```
OCQ1.<payload share compressé deflate-raw, en base64url>
```

Une enveloppe `kind:"share"` (jamais de privé), compressée par l'API native
`CompressionStream` puis encodée base64url. Lu par `parseInput` comme les
autres formats. Si l'API manque (très vieux navigateur), l'émetteur replie
vers le fichier `.oc` — le format ne change pas.

### Rendez-vous — OCR1 (QR appairé, P2P)

```
OCR1.<code court>
```

Le QR ne porte pas les données : un petit **code de rendez-vous**,
typable sans caméra (alphabet sans ambiguïté — ni i, l, o, 0, 1 —,
8 à 24 caractères une fois normalisé en minuscules sans séparateurs).
Les deux appareils dérivent la même salle P2P éphémère du code
(préfixe de salle `give-`, mêmes règles de transport que §5 : la
salle porte un hash, les données sont chiffrées de pair à pair) et
les fiches passent par la connexion — exclusivement en `sharePayload`
(vue communautaire, §3) avec l'aperçu avant fusion (§4). Un lecteur
ancien ignore ce préfixe sans casse ; le repli hors ligne reste
OCQ1/OCQP et le fichier `.oc`.

### Compact multi-parties — OCQP (QR animé)

```
OCQP.<i>.<n>.<tranche>
```

Quand l'OCQ1 dépasse ce qu'un seul QR lisible peut porter, la chaîne
complète est découpée en `n` tranches (`i` de 1 à `n`, 512 max) que
l'émetteur fait défiler à l'écran ; le lecteur réassemble dans n'importe
quel ordre puis relit l'OCQ1 obtenu. Un lecteur ancien ignore ce préfixe
sans casse — et le fichier `.oc` reste toujours possible.

### Chiffré — OC2 (format actuel)

```
OC2.1.<itérations>.<sel base64>.<iv base64>.<contenu chiffré base64>
```

AES-GCM 256 bits, clé dérivée du mot de passe par PBKDF2-SHA256
(600 000 itérations à l'écriture ; de 10 000 à 2 000 000 acceptées à la
lecture). L'ancienne forme `OC2.<sel>.<iv>.<contenu>` (150 000 itérations
implicites) reste lisible. Aucune clé n'existe dans le code : mot de passe
perdu = contenu irrécupérable.

### Scellé — OC1 (hérité)

`OC1.<somme fnv en hexa>.<contenu>` : **lecture seule**, pour compatibilité
avec les anciens fichiers. Un contenu altéré est refusé (`altéré`).

### Garde-fous à la lecture

Entrée de plus de 4 Mo refusée (`troplourd`) ; plus de 2 000 pistes refusées
(`tropdepistes`) ; entrées sans `name` ignorées silencieusement. Un OCQ1 dont
la **taille décompressée** dépasse 8 Mo est refusé (`troplourd`) — anti-bombe de
décompression. Tout JSON d'une source non fiable est lu par `safeJSONParse`,
qui **écarte** les clés `__proto__` / `constructor` / `prototype` (anti-pollution
de prototype).

## 3. Le schéma d'une piste — intouchable

Une piste normalisée a exactement ces champs :

**Partagé** — part dans un fichier `kind:"share"` :
`name`, `city`, `domain`, `desc`, `address`, `website`, `techs`,
`positions[]`, `process`, `tips`, `contacts[]`, `lat`, `lng`, `verifiedAt`,
`confirmations`, `updatedAt` (+ `extra` si présent).

**Privé** — ne part **jamais** dans un partage :
`status`, `notes`, `appliedAt`, `nextAction`, `nextActionText`, `closedAt`,
`closedReason`, `history[]` (40 entrées max).
Ni `id`, ni `demo`, ni `createdAt` ne circulent non plus.

**Un contact** : `id`, `name`, `role`, `email`, `phone`, `link`, `note`,
`conf` (`""` | `"ok"` | `"doubt"`) (+ `extra` si présent).
`link` est toujours en `http(s)` après normalisation : tout autre schéma
(`javascript:` et consorts) est neutralisé — un lien piégé dans un fichier
reçu ne doit jamais devenir cliquable.

**Vocabulaires fermés** :
- `domain` : `esn`, `cyber`, `cloud`, `dsi`, `public`, `startup`,
  `industrie`, `commerce`, `sante`, `autre` — valeur inconnue → `autre` ;
- `status` : `todo`, `active`, `reply` — valeur inconnue → `todo`.
  **Migration v5** (lecture seule, jamais réécrite en sortie) : `sent` et
  `followup` → `active` ; `interview` → `reply` ; `won` / `rejected` →
  piste **clôturée** (`closedReason` correspondant, `closedAt` déduit de
  `updatedAt`) avec `status: reply` ;
- `closedReason` : `""` (piste vivante), `won`, `rejected`, `dropped` ;
- `positions` : `stage`, `alternance`, `cdi`, `cdd`, `freelance`.

**La prochaine action** (privée) : `nextAction` porte la **date** (ISO,
champ historique inchangé — les anciennes données restent valides),
`nextActionText` porte le **verbe** (« Relancer le RH »). Les deux sont
optionnels et indépendants.

**Champs inconnus** (venus d'une version future) : conservés dans `extra`,
jamais perdus silencieusement.

## 4. Les invariants de la fusion — intouchables

1. La fusion **n'écrase jamais** une valeur existante ; elle ne complète que
   les champs vides.
2. Deux valeurs non vides différentes = divergence **comptée et signalée**,
   pas importée.
3. Le privé ne s'importe jamais : statut remis à `todo`, notes/dates vidées,
   prochaine action (verbe et date) et clôture vidées, historique remplacé
   par « Reçue via partage ».
4. Un contact reçu avec `conf:"ok"` redevient `"doubt"` : la confiance ne se
   transmet pas, elle se re-vérifie.
5. Déduplication des pistes : même nom **et** même ville (ou positions à
   moins de 30 km) = même piste ; homonymes ambigus = nouvelle piste plutôt
   qu'une mauvaise fusion. Contacts dédupliqués par email, sinon téléphone,
   sinon nom+rôle.
6. Re-fusionner le même fichier n'ajoute rien (idempotence).

## 5. La sync entre MES appareils — invariants

À ne pas confondre avec la fusion communautaire (§4) : ici les deux côtés
appartiennent à la même personne (`engine/sync.js`, transport P2P chiffré).

1. **Tout circule**, privé inclus — ce sont mes appareils.
2. **Le plus récent gagne**, piste par piste (`updatedAt`) ; le profil
   voyage en bloc (son `updatedAt` à lui).
3. **Les suppressions voyagent** par tombstones `{id, t}` : une pierre plus
   récente que la fiche la supprime partout ; une fiche modifiée **après**
   la suppression ressuscite (le geste le plus récent gagne).
4. La sync est **idempotente et convergente** : rejouer le même échange ne
   change rien, et deux appareils arrivent au même état quel que soit l'ordre.
5. La phrase de liaison ne transite jamais en clair : la salle P2P porte un
   hash, les données sont chiffrées de bout en bout.
6. Le **partage en groupe** (ex-« salle de promo » — le préfixe technique
   `promo-` et la clé `oc_promo_v1` ne changent pas), lui, passe exclusivement par `sharePayload`
   (vue communautaire, §3) et l'aperçu avant fusion (§4) — mêmes règles que
   par fichier, quel que soit le canal.

---

## Ce qui peut changer librement

Tout le reste : `index.html` et `app.js` — écrans, composants, styles,
textes, navigation, gestes. C'est précisément le but de la séparation
moteur / interface : refaire l'interface sans jamais toucher aux quatre
sections ci-dessus. Le moteur (`engine/`) peut lui aussi évoluer à
l'intérieur, tant que les tests de contrat restent verts.
