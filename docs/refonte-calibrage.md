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

## Prochains forks (ordre prévu)

2. **Navigation** — les deux cockpits partagent-ils le même squelette ? Quel est
   le découpage de haut niveau (*faire* vs *régler* ?).
3. **Où atterrissent campagnes & IA** — les orphelins qui n'entrent pas dans les
   zones actuelles.
4. **Doctrine de l'avancé** — la règle unique de progressive disclosure.
5. **Le fil du nouvel arrivant** — les 4 premiers gestes.
