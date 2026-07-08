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
| `oc_profile_v1` | Profil, modèles d'emails, fiches confirmées, flags | JSON : objet profil |
| `oc_journal_v1` | Journal privé des actions (200 max) | JSON : tableau `{t, txt, cid}` |
| `oc_orphans_v1` | Contacts « à rattacher » (sans entreprise) — l'indice d'entreprise saisi par l'utilisateur voyage dans `extra.company` (D3), consommé au rattachement | JSON : tableau de contacts |
| `oc_theme` | `light` ou `dark` | chaîne |
| `oc_view` | `map`, `list` ou `grid` (héritée, plus écrite) | chaîne |
| `oc_data_v2`, `ais_stage_targets_v1` | Anciennes clés (v1/v2), lues une seule fois pour migration | lecture seule |

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
  plus le profil, plus le champ **optionnel** `orphans` (contacts « à
  rattacher ») s'il y en a. Un lecteur qui ignore `orphans` charge quand même
  le reste sans erreur.
- Tolérance à la lecture : un simple tableau JSON de pistes est aussi accepté.

### Compact — OCQ1 (échange par QR)

```
OCQ1.<payload share compressé deflate-raw, en base64url>
```

Une enveloppe `kind:"share"` (jamais de privé), compressée par l'API native
`CompressionStream` puis encodée base64url. Lu par `parseInput` comme les
autres formats. Si l'API manque (très vieux navigateur), l'émetteur replie
vers le fichier `.oc` — le format ne change pas.

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
(`tropdepistes`) ; entrées sans `name` ignorées silencieusement.

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

---

## Ce qui peut changer librement

Tout le reste : `index.html` et `app.js` — écrans, composants, styles,
textes, navigation, gestes. C'est précisément le but de la séparation
moteur / interface : refaire l'interface sans jamais toucher aux quatre
sections ci-dessus. Le moteur (`engine/`) peut lui aussi évoluer à
l'intérieur, tant que les tests de contrat restent verts.
