# Refonte OpenContact — journal de calibrage (à deux)

> Décisions de conception **prises ensemble** (mainteneur + assistant) avant
> d'ouvrir le chantier de refonte. Un fork à la fois : position tranchée →
> discussion → décision verrouillée. On ne re-décide pas ce qui est verrouillé.
> S'appuie sur les diagnostics `docs/audit-ux-2026.md` et
> `docs/audit-ux-2026-nouveautes.md`. Rien ici n'est encore codé.

Statut : **en cours de calibrage.**

---

## Décision 1 — Positionnement : deux personnalités selon le contexte (option C)

**Le fork.** OpenContact, c'est un outil simple à puissance cachée (A), une
plateforme riche assumée (B), ou un entre-deux explicite mobile/desktop (C) ?

**Décidé : C.** Deux personnalités selon le contexte — et ce n'est pas une
invention : c'est finir ce que `CLAUDE.md §5` pose déjà (« adaptatif, PAS
responsive »), aujourd'hui à moitié construit (seul « Mes pistes » a une vraie
personnalité desktop ; le reste est la colonne mobile centrée à 640 px).

**La loi de C — « un seul cerveau, deux cockpits ».**
Même moteur, mêmes données, même peau « 98 », **même vocabulaire**. Ce qui
change entre mobile et desktop, ce n'est ni les fonctions ni les mots — c'est
**la surface par défaut** et **ce que chaque contexte met en avant**.

- **Mobile = A = le terrain.** Optimisé pour la boucle de 30 s : capturer,
  « je fais quoi maintenant », agir, échanger en personne (QR). La puissance
  existe mais elle est **atteignable, pas promue**.
- **Desktop = B = le poste de commandement.** Optimisé pour les sessions
  posées : tableau, campagnes, IA, multi-appareils, Compagnon, écriture longue.
  La puissance y est **de premier plan et assumée** — on a la place et le temps.

**Le garde-fou (à ne jamais franchir).** On joue sur **promouvoir vs
atteindre**, **jamais sur amputer**. Tout reste **faisable** depuis le mobile ;
rien n'est « desktop only » **par choix de design**. Seule exception légitime :
quand la **plateforme** l'impose (un téléphone ne peut pas installer une app de
bureau → le Compagnon s'*installe* sur l'ordinateur ; c'est de l'honnêteté, pas
une amputation).

**Bascule.** Personnalité qui change à **901 px, d'un coup** — un seul
breakpoint, pas de zone tiède (plus simple, déjà en place). Cas tablette : non
traité séparément, il tombe d'un côté ou de l'autre du breakpoint.

**Ce que ça résout d'un coup :** C1 (fourre-tout « Moi »), C2 (adaptatif
inachevé), C5 (expertise exposée trop tôt), et une partie des N (nouveautés).

---

## Décision 2 — Navigation : même squelette, découpage *faire / régler* (option A)

Un seul squelette de nav, **identique sur les deux cockpits** (mêmes entrées,
mêmes mots) — sinon on ré-apprend en changeant d'appareil. Découpage de haut
niveau : **faire** vs **régler**.

- **Faire :** Aujourd'hui · Mes pistes · Échanger.
- **Régler : « Moi »**, une seule porte. En haut **Profil & données** (léger,
  pour tous) ; en dessous **Réglages** (verrou, appareils, connexions, IA,
  Compagnon) — replié sur mobile, déployé en colonnes sur desktop.

**4 entrées, pas 5** (option A) : le « régler » reste plié dans « Moi ». Le
split *faire/régler* est le principe d'organisation, pas deux onglets de plus.
La capture **(+)** reste le héros central du mobile.

---

## Décision 3 — Loi de sobriété : l'explication n'a pas sa place

**La règle du regard.** Si un écran a besoin d'une *phrase* pour être compris,
c'est le **design** qui a raté : on **redessine**, on n'**annote** pas.
« Un regard, on comprend. » Cette loi **prime sur tout le reste** et se vérifie
écran par écran.

- **Banni :** tout ce qui *explique comment ou pourquoi* — section « Comment ça
  marche », hints pédagogiques, paragraphes de rassurance, sous-titres qui
  décrivent un bouton.
- **Gardé :** le texte qui *est* l'information — un libellé, un état, un retour.
  **Un mot, jamais une phrase.**
- **Concepts à conséquence** (privé vs partagé, fusion, phrase de liaison) : pas
  de texte non plus — on les règle en **montrant** (état visuel, aperçu qui
  montre au lieu de dire, distinction visuelle nette). Plus fort qu'un
  avertissement.
- Le « c'est quoi / pourquoi / guide complet » part sur un **site séparé**,
  hors application.

---

## Décision 4 — Contenu de « Profil & données »

- **« Comment ça marche » → retiré** de l'app (vers le site séparé). L'aide
  devient du *design*, pas du texte (Décision 3).
- **« Coup de pouce IA » → assistant d'import d'e-mails**, uniquement. La
  bibliothèque de prompts (créer/éditer/supprimer, 8 max, réinitialiser) est
  retirée. Placement final au fork #3.
- **Sauvegarde scindée en deux :**
  - **« Garder une copie »** = geste **ambiant, 1 tap, promu** sur le terrain,
    déclenché par l'état (« N pistes depuis ta dernière copie »), jamais
    culpabilisant, sans jargon « .oc ». Se calme si les appareils sont reliés
    (données déjà en double).
  - **« Restaurer »** = rare + sensible → dans **Réglages**, derrière le verrou.
- **CV & LM → dans « Profil & données », en variantes nommées optionnelles.**
  - Le profil range **0..n documents nommés** (« CV cyber », « LM générale »…).
  - À l'écriture / au montage de campagne : deux sélecteurs indépendants
    **CV : `Aucun ▾`** / **LM : `Aucun ▾`**. « Aucun » est un choix de premier
    rang ; le cas simple reste `Aucun / Mon CV`.
  - **Campagne :** CV/LM au **J0 seulement**, pas aux relances (surchargeable).
    *(appel délégué)*
  - **Vraie pièce jointe PDF** (pas un lien dans le corps) — touche
    `engine/mailer.js`, à cadrer au build. *(appel délégué)*

---

## Décision 5 — IA & campagnes : les orphelins trouvent leur place (fork #3)

**L'IA n'est pas un lieu — elle se dissout.** Personne ne pense « je veux
utiliser l'IA » ; on pense « ajouter des pistes depuis ma boîte mail ». Donc
pas de zone « IA » (une case « IA » est une abstraction à décoder — contraire à
la Décision 3).

- **Actions IA → là où le résultat apparaît.** « Importer mes e-mails → pistes »
  est **une source de la capture** (« Ajouter une piste → depuis mes e-mails »),
  pas une entrée de « Recevoir ». Du coup **« Recevoir » redevient net** : ce
  qu'un *camarade* m'envoie, pas ce que je fouille chez moi. Les propositions de
  l'assistant = des pistes **à trier** qui remontent dans Aujourd'hui.
- **Tuyauterie IA → Réglages.** Fournisseurs, clés, autorisation du Compagnon =
  réglage ponctuel, sous « Moi ».

**Les campagnes = une facette de « Mes pistes ».** Même famille que « où j'en
suis avec mes pistes ».

- **Lancées** par Prospecter, **gérées** dans un espace « Campagnes » de Mes
  pistes (desktop-forward : liste des campagnes vivantes, état, pause/arrêt),
  minimal sur mobile.
- Les **envois du jour** remontent dans Aujourd'hui comme des actions, **sous**
  le travail du jour (pas au-dessus), non tronqués.
- Une campagne a désormais une **maison trouvable**, même quand rien n'est dû.
  Corrige **N4** (pas de home) et **N5** (rappel qui vole la vedette).

Bénéfice transverse : « Moi » se vide de deux mondes, et le desktop gagne
enfin de la largeur (colonnes campagnes / Ia-réglages).

---

## Décision 6 — Loi de disponibilité : indisponible = absent

**La règle.** On n'affiche **pas** un contrôle dont la condition n'est pas
remplie. Ni grisé, ni désactivé, ni « on clique → non » : **absent.** Moins de
bruit, aucun cul-de-sac. Corrige **C3** et **N9**.

**Le garde-fou (clarté sans trou de découvrabilité) :** on montre **l'action
disponible la plus proche, jamais l'issue indisponible.**

- Une capacité derrière un pré-requis apparaît **comme son pré-requis** (qui,
  lui, est disponible), pas comme une version cassée d'elle-même. Ex. : pas de
  « Connecter » qui refuse → « **Protéger pour connecter ta messagerie** », une
  étape faisable qui mène à la capacité.
- **Actions** (Envoyer, Reprendre, commandes d'appareil…) : absentes quand elles
  ne peuvent pas agir ; c'est l'**état** qui dit ce qui se passe (« prêts —
  partiront lundi »), de l'*information*, pas de l'*explication* (Décision 3).
- Pré-requis = **un autre appareil** (Compagnon) : légitimement non proposé sur
  mobile — exception plateforme de la Décision 1, pas une amputation.

**Trois lois de visibilité** qui se tiennent : **#3** (pas d'explication) ·
**#6** (indisponible = absent) · **fork #4** à venir (avancé replié). Ensemble :
*ce qu'on voit est exactement ce qu'on peut faire, maintenant.*

---

## Décision 7 — Ajouter une piste : deux blocs, deux boutons

Une piste = **deux grosses informations : l'entreprise et le contact** (avec
ses coordonnées). L'ajout se construit autour de ces deux-là, ensemble — fini
le détour actuel « créer la piste, puis ouvrir la fiche, puis ajouter un
contact », et fini le lien « plutôt un contact ? ».

**L'écran d'ajout = deux blocs, l'un sous l'autre :**

```
L'ENTREPRISE
[ Nom de la boîte ]

LE CONTACT   (si tu en as un)
[ Nom de la personne ]
[ Son email ou son téléphone ]
```

On **remplit ce qu'on a**. Juste l'entreprise → validé. Une personne + un email
→ la piste est tout de suite **utilisable** (on peut lui écrire dans la foulée).

**Deux boutons de validation :**
- **« Ajouter »** → créé, le champ se vide, prêt pour la suivante (**rafale** :
  noter plein de boîtes très vite). Confirmation courte « ✓ X ajoutée » (un
  mot, pas une phrase — Décision 3).
- **« Ajouter et compléter »** → créé **et** ouvre la fiche pour le reste.

**Le reste des champs (ville, domaine, site, technos, postes, process,
conseils, adresse, notes) vit dans la fiche, pas dans l'ajout.** La capture
reste les deux blocs.

**Cas « juste la personne, pas d'entreprise » :** jamais bloqué. Ça
s'enregistre, la personne va dans le bac **« à rattacher »** (existant),
Aujourd'hui rappelle gentiment de lui trouver sa boîte. Rien n'est perdu
(invariant « toute donnée saisie est précieuse »).

**Petit plus :** email `nadia@ovhcloud.com` → l'app propose **« OVHcloud »**
comme entreprise en un tap. Résout la plupart des cas seuls.

---

## Décision 8 — L'avancé se replie ; la barre « Affiner » (fork #4)

**Règle (doctrine de l'avancé).** L'essentiel est visible ; l'avancé se replie
derrière un geste qui se comprend d'un regard (un « Affiner », un « Avancé », un
chevron) — jamais une phrase. Ce qu'on replie est *rare*, *pour peu de gens*, et
*non bloquant*. C'est la 3ᵉ loi de visibilité, avec #3 et #6.

**Son cas d'école — la barre de « Mes pistes »** (recherche + filtre + tri +
ordre, un seul groupe) :

```
[ 🔍 Chercher…            ] [ Affiner ]
  À contacter ✕   Complétude ✕            ← seulement quand c'est actif
```

- **Recherche = le héros visible** du groupe.
- **Un seul bouton « Affiner »** remplace les 3 icônes muettes → une feuille :
  filtres (statut, domaine) + tri (liste courte), **même grammaire**. Le tri
  multi-niveaux « puis par » est **replié** (avancé).
- **État actif = puces sous la recherche** (`À contacter ✕`, `Complétude ✕`) :
  un regard suffit ; la croix enlève.
- **Le sens du tri vit dans la puce** (taper la puce l'inverse ↑/↓) → plus de
  bouton de sens séparé, plus de réglage en double.
- Desktop : le tableau segmente déjà le statut → « Affiner » = domaine + tri,
  mêmes puces.
- Corrige **N1, N2, N3**.

---

## Prochains forks

5. **Le fil du nouvel arrivant** — les tout premiers pas, sans un seul écran
   d'explication. *(en cours)*
