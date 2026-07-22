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

## Décision 9 — Le fil du nouvel arrivant : on apprend en faisant (fork #5)

**Zéro tuto, zéro visite guidée, zéro bulle d'aide.** Les écrans vides + une
invite au bon moment **sont** l'accueil (cohérent avec la Décision 3).

- **Premier lancement → foncer sur l'ajout d'une piste** (valeur tout de suite).
  Le profil est demandé **plus tard**, au 1ᵉʳ email seulement — jamais un
  formulaire « qui es-tu ? » au départ.
- **« Voir un exemple »** (démo) conservé : montre l'app remplie sans rien lire.
- Chaque invite = **le prochain geste utile**, au moment où il compte, montré
  une fois, ignorable, jamais culpabilisant :
  piste → 1ʳᵉ action (depuis « Aujourd'hui » encore calme) → profil (au 1ᵉʳ
  email) → « garder une copie » (après quelques pistes).

---

## Décision 10 — « Aujourd'hui » : le travail du jour est le héros

**Dégraissage.** Les 5 bandeaux actuels (contacts à rattacher, reçu de la promo,
propositions IA, assistant, campagnes — `today.js:104-109`, empilés **au-dessus**
du travail) sont rangés :
- Les **actions du jour d'abord** (En retard · Aujourd'hui).
- Les reçus/proposés → **une seule ligne « À trier (N) »**, calme.
- Les **campagnes → une ligne SOUS le travail**, jamais tronquée (la maison des
  campagnes reste « Mes pistes », Décision 5).

**Ordre mobile :** titre + « ✓ N faites » · EN RETARD · AUJOURD'HUI · campagnes du
jour · ⌄ Bientôt (replié) · À trier.

**Desktop (poste de commandement) :** la liste **+ un panneau latéral pour la
fiche** — on ouvre une piste à droite, la liste reste (le standard prouvé
Huntr/Lemlist), pas deux colonnes ni une fenêtre qui recouvre. Corrige **N5**,
**C2**, et le **double-modal (N8)** sur cet écran.

Conforté par la veille : Lemlist « Required / Coming soon » = nos tranches ;
Huntr/Lemlist/Teal séparent tous la to-do du reste.

---

## Décision 11 — Les chiffres : pousser à agir, jamais à contempler

**Règle.** Un chiffre a sa place s'il donne de l'**élan** OU s'il **mène à une
action**. Sinon, non. **Remplace** le « pas d'analytics » du brief d'origine.

- ✅ « 3 faites aujourd'hui », « 6 relances cette semaine » (élan) · « 5 sans
  réponse depuis 15 j », « 8 sans prochaine action » (tape → la liste) · « 12
  actives · 4 en attente ».
- ❌ graphes par jour/semaine/mois, entonnoirs de conversion, tout chiffre qu'on
  ne fait que regarder ou qui culpabilise.
- **Tissés là où ils servent** (des portes vers une action), surtout desktop ;
  mobile garde juste « N faites aujourd'hui ». **Jamais d'onglet « Stats ».**

---

## Décision 12 — Évolutivité : le haut niveau est fermé, la croissance se fait dedans

Une nouvelle feature ne doit **jamais** ajouter un onglet ni bousculer le reste.
La nav (4 entrées, *faire / régler*) est **figée**. Toute nouveauté trouve sa
place dans un **slot existant**, en répondant à *« c'est quoi ? »* :

| Une nouvelle… | …atterrit dans |
|---|---|
| **source** de pistes | « Ajouter une piste » (comme l'import e-mails) |
| **action** sur une piste | la fiche → remonte dans Aujourd'hui |
| **canal** d'échange | Échanger (Donner / Recevoir) |
| **réglage / intégration** | Réglages, replié (Décision 8) |
| **chiffre** | une porte vers une action (Décision 11), pas un écran |
| **item reçu à trier** | la ligne « À trier » (Décision 10), pas un bandeau |

Et elle **obéit aux lois** (3, 6, 8, 11) → elle ne peut ni encombrer ni
expliquer. Exemples : *scanner une carte de visite* = nouvelle **source** ;
*rappel d'entretien* = nouvelle **action** ; *un autre fournisseur d'IA* =
**réglage** replié ; *un nouveau type de contenu reçu* = rejoint **« À trier »**.
Rien d'autre ne bouge.

---

## Décision 13 — « Mes pistes » : la base, épurée

- **Statut affiché une seule fois.** Liste mobile : une **pastille claire**
  (texte + couleur) par ligne — fini le doublon pastille/étiquette (C8). Tableau
  desktop : **rien sur la carte**, c'est la colonne qui dit le statut.
- **Bac « à rattacher » = une ligne calme repliée** en haut (présente,
  trouvable, mais elle ne vole plus la place aux vraies pistes).
- **Les campagnes ont leur maison ici** : un accès **« Campagnes (N) »** à côté
  de **« Prospecter »** — *Prospecter = lancer*, *Campagnes = gérer*. N'apparaît
  que s'il y en a (loi #6). Résout **N4** (home des campagnes) et **N7**
  (découvrabilité de Prospecter).
- **Clôturées** repliées en bas (inchangé).
- **Desktop** : tableau 3 colonnes inchangé ; ouvrir une piste = **panneau
  latéral** (Décision 10) ; « Campagnes » s'ouvre en panneau, pas un onglet.

---

## Décision 14 — Le modèle : l'entreprise se suit, la personne s'agit

**Deux niveaux, jamais mélangés :**
- **L'entreprise = le suivi.** Un statut, une place dans le tableau, les notes,
  la référence *(l'opportunité)*. Le tableau/liste (Mes pistes) restent **par
  entreprise**, inchangés.
- **Le contact = l'action.** Écrire, relancer, prochaine action, prospection,
  campagne ciblent **une personne** — fini le « premier email deviné ».
  L'action reste **aussi** possible au niveau entreprise (« envoyer la
  candidature » avant d'avoir un nom).

**Contact dormant.** Un contact ne devient une « action » que **quand tu
l'actives** (tu lui écris / tu lui poses une action). Sinon, c'est juste **un
nom connu.**
- Reçu d'un ami → **enrichit ta carte, zéro to-do** : jamais dans « Aujourd'hui »,
  jamais coché tout seul en prospection. Ton **suivi reste privé** (invariant).
- Fiche : personnes **actives en haut**, dormantes/reçues **repliées** (« + N
  personnes connues »), repère « reçu de la promo ».

**Ce que ça règle :** le « mur » de contacts dans la fiche, le « à qui
j'écris ? », et **N6** (plus de boîtes écartées faute d'email — tu choisis qui
en a un).

**Un cran de plus, plus tard (loi #12) :** un **statut par contact** (deux
conversations parallèles dans une même boîte) — pas maintenant, greffable sans
casse si le besoin vient.

**Périmètre (vérifié) : additif et rétrocompatible.**
- Touche ~6 fichiers de la **zone action** (`model.js` + migration, `today.js`,
  `actions.js`, `assist.js`, `fiche.js`, `prospect.js`, `filter.js`) +
  `CONTRAT.md` / `tests.js`.
- **N'affecte PAS** le statut/tableau, ni l'infra sync/chiffrement/stockage/
  partage/P2P, ni le moteur de campagne (déjà person-targeted).
- Construction **par petits pas** (le champ d'abord, puis chaque écran), pas de
  big-bang.

---

## Décision 15 — La fiche : resserrée autour de « où j'en suis + quoi ensuite »

- **Héros en haut :** *où j'en suis* (statut entreprise) + *prochaine action* —
  ce qu'on vient voir 9 fois sur 10.
- **Contacts = le bloc d'action** juste dessous : **liste compacte** (une
  ligne/personne), **actifs en haut**, dormants repliés (Décision 14) ; on
  déplie une personne pour ses coordonnées/actions. Plus de mur.
- **« À savoir » + « Historique » repliés** (référence, pas quotidien).
- **Sections vides masquées** (loi #6) : une piste neuve n'a pas de trous —
  juste **« Compléter »** (le % est la porte). Cible de « Ajouter et compléter »
  (Décision 7).
- **« Écrire »** = action sortante principale → ouvre le **composeur** (choix
  **CV/LM**, Décision 4) vers **la personne** choisie.
- **Tampon + « Confirmer »** (rien ne s'écrit avant) conservé. Mobile = feuille ;
  desktop = **panneau latéral** (Décision 10).

---

## Décision 16 — Écrire un email : déjà bon, resserré

**Déjà bon, conservé :** destinataire = **une personne** (contacts avec email,
donc déjà aligné #14) ; modèle → objet + message éditables ; brouillon IA
optionnel ; envoi direct si messagerie connectée, sinon « Ouvrir dans Mail » /
« Envoyée ✓ » ; après envoi, « Envoyé ✓ — et ensuite ? » → **« Relancer [la
personne] »** ; mode série (Prospecter).

**Ajouts / resserrages :**
- **Joindre CV / LM** (Décision 4) : une ligne **discrète, juste au-dessus de
  l'envoi** — `📎 CV [Aucun ▾]  LM [Aucun ▾]`, « Aucun » par défaut, **vraie
  pièce jointe PDF**. **Masquée s'il n'y a aucun document** (loi #6, un
  « ＋ joindre un CV » discret à la place) ; quand un doc est joint, la ligne
  affiche son nom (`📎 CV cyber`) — un regard suffit.
- **Profil vide → une action, pas un sermon** : « ✏ Compléter mon profil »
  remplace le warning (loi #6 + Décision 9). Motivé : un email non signé /
  « troué » est gênant (vu en capture).
- **Pas d'email sur la personne** : « Envoyer » **absent** (pas grisé), « Copier »
  devient le bouton principal (loi #6).
- **Fin du double-modal (N8)** : « Écrire » s'ouvre **dans le panneau de la
  fiche**, pas une 2ᵉ fenêtre empilée (vu en capture sur desktop).

---

## Décision 17 — Prospecter & campagnes : vers une personne, sans aucun code

**Prospecter → une personne choisie.** On coche ses pistes, mais chaque envoi
part vers **une personne visible et choisie** (plus de « premier email »
deviné). Une boîte **sans contact** propose **« ＋ ajoute quelqu'un »** au lieu
d'être écartée en silence → **N6 réglé**. Puis « Une par une » ou « En
campagne » (inchangé). Simple et ergonomique.

**Jamais de code `{{...}}` — nulle part.** L'utilisateur voit **toujours un
vrai email rempli** ; les bouts qui changent selon la personne (prénom,
entreprise) sont **remplis automatiquement et surlignés en douceur**, le reste
s'écrit en texte normal. **Vaut partout** : composeur (#16), wizard de
campagne, **et les modèles d'emails** (à appliquer quand on fera « Profil &
données »).

**Wizard de campagne resserré :** le **Compagnon quitte le wizard** (« mon
ordinateur envoie tout seul » n'apparaît que s'il est déjà associé — loi #6) ;
**aperçu du vrai email d'abord**. Le cœur reste : 1 message + 2 relances figées,
15/jour, s'arrête sur réponse, mention d'opposition.

**Maison :** « Campagnes (N) » dans Mes pistes (#13) ; envois du jour dans
« Aujourd'hui » sous le travail (#10).

---

## Décision 18 — Échanger : rangé, sans explications

- **Recevoir simplifié** (Décision 5) : **Scanner · Ouvrir un fichier · Coller**.
  Plus de « Depuis mes e-mails » (parti dans la capture). « Recevoir » = ce
  qu'un **camarade** t'envoie.
- **Donner** (bon, conservé) : **QR** (en personne) / **Fichier** (à distance,
  chiffrable) ; l'app choisit le bon QR selon le réseau. Mobile = QR d'abord ;
  desktop = fichier d'abord + **pont QR** (l'ordi affiche, le téléphone scanne).
- **Partage en groupe : discret, assumé.** On **retire le « bêta »** ; 3ᵉ option
  calme sous Donner/Recevoir.
- **Explications supprimées** (loi #3, vu en capture) :
  - Mot de passe : le pavé « Un mot de passe pour le groupe… jamais ton suivi
    privé » → **retiré**. Reste : le champ « Mot de passe du groupe » + « Entrer ».
  - Écran connecté : « Chacun garde la feuille ouverte ; chaque envoi montre un
    aperçu avant fusion » → **retiré** (évident quand l'aperçu apparaît).
- **Le rappel « jamais ton suivi privé »** : au **moment d'envoyer** (court),
  pas en permanence.

**Comportement confirmé (pour mémoire) :** pas de limite codée de participants
— pair-à-pair en maille, fait pour une promo/classe (dizaines max) ; envois
simultanés → **file d'aperçus un par un**, doublons filtrés, rien d'écrasé ; le
**code EST la clé** (un code banal laisse entrer des inconnus — mais fiches
publiques seulement, jamais le privé, et tout passe par l'aperçu).

**Code fort — discret, dans le champ.** Un petit bouton **↻ (icône pixel,
aria-label « Générer un code fort »)** au bout du champ le remplit d'une phrase
forte (comme la liaison des appareils) ; qui veut le sien tape le sien. Une
fois généré, un **« copier » discret** apparaît (il faut pouvoir le partager à
la promo). L'icône doit se comprendre d'un regard (un **dé** « au hasard »
peut-être plus clair qu'un ↻ — à valider au build).

---

## Décision 19 — Boîte à réflexes UX : économiser l'espace et la charge mentale

Une boîte à outils qu'on **dégaine à chaque écran**, avant d'ajouter quoi que
ce soit. Elle sert les lois #3 (pas d'explication), #6 (indisponible = absent),
#8 (avancé replié).

1. **L'action va où vit la donnée** — un bouton *dans* le champ (générer,
   effacer ✕, copier) plutôt qu'une ligne/bouton à part.
2. **L'état se montre, il ne s'explique pas** — une puce compacte retirable
   (filtres actifs) au lieu d'une phrase.
3. **Éditer sur place** — taper une valeur la change là où elle est (statut,
   action), pas un écran de formulaire.
4. **Un seul contrôle, plusieurs états** — un bouton qui s'adapte (Trier ↔
   réinitialiser) plutôt que deux.
5. **Vide = absent** — pas de champ grisé ni de section vide ; l'absence est le
   message.
6. **Défauts malins** — pré-remplir le plus probable (code généré, contact
   principal, « +3 j ») : on **confirme**, on ne compose pas.
7. **Une icône lisible vaut un mot** — mais seulement si « un regard, on
   comprend » (jamais l'icône cryptique de N1), toujours avec un aria-label.
8. **Regrouper au lieu d'éparpiller** — une surface pour des contrôles liés
   (« Affiner ») plutôt que des boutons dispersés.

---

## Décision 20 — « Moi » éclaté : Profil & données (visible) + Réglages (à part)

Concrétise #2 & #4 — « Moi » devient **deux mondes** :

- **Profil & données** — léger, pour tous, **toujours visible** : Mon profil ·
  Mes modèles d'emails · Mes CV & lettres (variantes, #4) · **Garder une copie**
  (sauvegarde promue, #4). *Contenu déjà calibré par #4, #16, #17 — reste la
  mise en écran.*
- **Réglages** — la config : Verrouillage · Mes appareils (Compagnon inclus) ·
  Connexions (messagerie + IA). **Une porte à part sur mobile** (garde « Moi »
  minimal — le terrain), **dépliée en colonnes sur desktop** (le poste de
  commandement a la place).

---

## Décision 21 — Réglages : noms clairs, voix humaine, explication à la demande

**Des lignes claires**, chacune = **nom + état (un mot) + geste** :
- **Protection** — mettre un code pour ouvrir l'app.
- **Mes appareils** — relier téléphone + ordinateur (Compagnon inclus).
- **Ma messagerie** — connecter Gmail / Outlook. *(« Connexions » éclaté — le
  nom ne disait rien.)*
- **Mon assistant IA** — brancher une IA (brouillons, import d'e-mails).
- **Le Compagnon** — **ligne visible avec un vrai bouton** : sur ordinateur
  « Télécharger pour Windows / Mac / Linux » (le mécanisme existe déjà, il était
  enfoui dans « Mes appareils ») ; sur téléphone « s'installe sur ton
  ordinateur » + « Copier le lien ».

**Explication : le nom d'abord, l'écran ensuite** (pattern Material Design,
confirmé par la veille).
- **Si le nom se suffit → aucune explication** (Protection, Ma messagerie, Mes
  appareils). La liste reste sans texte.
- **Pour les rares réglages obscurs** (Le Compagnon, éventuellement Mon
  assistant IA) → l'explication vit **sur l'écran du réglage lui-même** (le 2ᵉ
  écran, quand on entre pour l'installer / le brancher), en clair et humaine,
  surtout dans son état « pas encore configuré » ; elle s'efface une fois branché.
- **Pas de « ? », pas de bulle** : entrer dans le réglage amène déjà à
  l'explication. Charge mentale minimale.

**Ranger l'expert** (déjà décidé) : avancé replié dans chaque réglage — TURN
(N10), commandes à distance, changement de clés ; **phrase de liaison masquée**
par défaut (N11) ; plus de **« Connecter » qui refuse** (N9 → « Protéger pour
connecter ») ; plus de **double-modal** (N8).

**Raffinement de la loi #3 — voix & explication :**
- **Agir → zéro explication** (le design suffit). **Régler → une vraie
  explication est permise, mais sur l'écran du réglage (2ᵉ écran), jamais sur la
  liste et jamais une bulle** (pattern Material Design).
- **Voix humaine partout** : on écrit comme on parle à un ami — phrases
  entières, simples. **Jamais le style « pub IA »** : pas de slogan, pas de
  fragment coupé pour faire stylé, pas de « & ».

---

# Fondations calibrées ✓ — et ce qui reste

Les **décisions ci-dessus = le squelette, les lois, et le 1ᵉʳ écran conçu
(« Aujourd'hui »).** C'est le plus dur, et c'est fait. Elles ne se re-discutent
plus ; tout le reste s'y **applique**.

**Ce qui reste = concevoir chaque écran, un par un, mobile d'abord**, en passant
chacun au filtre des 9 décisions. Ça va plus vite maintenant qu'on a le cadre.

## Ce qui reste à concevoir

**Faire :**
- **Aujourd'hui** — ✅ **calibré (Décision 10).**
- **Mes pistes** — ✅ **calibré (Décision 13).** *(reste au build : glisser +
  équivalent clavier, C9)*
- **La fiche** — ✅ **calibré (Décisions 14 & 15).**
- **Écrire un email** — ✅ **calibré (Décision 16).**
- **Prospecter + Campagnes** — ✅ **calibré (Décision 17).**
- **Échanger** — ✅ **calibré (Décision 18).**

**Régler (« Moi ») :**
- **Profil & données** — ✅ **structure calibrée (#20)** ; contenu déjà couvert
  par #4 (CV/LM, sauvegarde), #16 (profil), #17 (modèles sans code). Reste la
  mise en écran.
- **Réglages** — ✅ **calibré (#21)** : noms clairs, voix humaine, explication à
  la demande (« ? »), avancé replié, Compagnon visible avec bouton.

**Transverse :**
- **Fin du double-modal** sur desktop (N8).
- **Montrer au lieu d'expliquer** les concepts à conséquence : privé vs partagé
  (distinction visuelle), aperçu avant fusion, phrase de liaison.
- **Verrou déclenché au bon moment** (1ᵉʳ email / 1ʳᵉ connexion), pas en réglage
  isolé.
- **Le site séparé** (guide / marketing) — livrable à part (Décisions 3 & 4).
- **Passe accessibilité clavier** (C9) + **thème sombre** vérifié partout.

**Méthode :** écran par écran, mobile d'abord, vérifié en lançant l'app
(390 + 1280, clair + sombre, `?test` vert). **On regarde les références**
(Huntr/Lemlist, Material Design…) avant d'inventer. On peut basculer de
*décider* à *construire* quand tu veux.
