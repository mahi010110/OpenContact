# Refonte UX d'OpenContact — brief pour toi

Tu vas refondre l'expérience (UX) d'une app existante. Avant de coder, lis tout, explore le dépôt, et si quelque chose est ambigu **pose-moi tes questions et propose ton plan avant de te lancer**. Travaille mobile d'abord, écran par écran, et vérifie ton travail en lançant réellement l'app. Ne fais pas tout d'un coup.

## Point de départ : page blanche

**L'UX actuelle n'est PAS ta référence — c'est le problème à dépasser.** Ne t'inspire pas de son organisation, de sa navigation, de ses écrans ni de ses parcours. Trois choses seulement survivent de l'ancienne version, listées plus bas : le **moteur** (`engine/`), l'**identité visuelle « 98 »** (les tokens), et les quelques **« excellentes idées »** explicitement nommées. *Distinction clé :* tu réutilises ces **fondations techniques** (ne réécris pas le moteur), mais tu **reconçois toute l'expérience** à partir de zéro.

## Pourquoi cette app existe (l'intention)

OpenContact aide des étudiants en **informatique / cybersécurité** à trouver un stage, une alternance ou un emploi. L'idée forte et rare : le savoir se **partage au sein d'une promo** — chaque promo laisse la carte plus riche pour la suivante. C'est **local-first** : pas de compte, pas de serveur, les données vivent dans le navigateur et circulent par fichiers `.oc` échangés de la main à la main.

La recherche d'emploi est un grind : répétitif, démoralisant, on perd le fil. L'app qui gagne est celle qui répond à **« je fais quoi maintenant ? »** et qui donne un **sentiment d'élan**. Garde cette vérité émotionnelle en tête à chaque décision.

## La boussole : simplicité par soustraction

Le vrai défaut de la version actuelle, ce n'est pas l'esthétique — c'est **« trop complexe, trop de choses différentes »**. Ton objectif n'est pas de faire *plus beau*, c'est de faire **moins de choses, mieux**. Filtre chaque écran par : *« est-ce que ça gagne vraiment sa place, ou ça ajoute une chose à apprendre ? »* En cas de doute, **coupe**. Réduire la charge cognitive est le livrable n°1.

## Ce qui existe et que tu GARDES (ne le réinvente pas)

- **Le moteur `engine/`** (modèle de données, fusion, chiffrement AES, stockage, score) : logique éprouvée, c'est ta fondation — réutilise-la et préserve ses garanties. Tu as le droit de l'**agrandir** là où le nouveau modèle l'exige (voir la section « Le moteur : tu peux l'agrandir, pas le casser »), mais sans le réécrire ni le casser.
- **L'identité visuelle « Utilitaire 98 »** et les tokens de `styles/tokens/` : c'est une identité distinctive, rare, à conserver. Tu refonds l'architecture et les parcours, **pas la peau**.
- **La techno** : JavaScript pur, modules ES, **sans framework, sans build**, PWA. Reste là-dessus — c'est cohérent avec le local-first et l'hébergement statique.
- **Les excellentes idées à préserver** : le mode « Prospecter » (candidatures en série, chaque email reste perso) ; la fusion qui **n'écrase jamais** + « Annuler » ~30 s ; le privé qui ne part **jamais** dans un partage ; l'indice de complétude ; les modèles d'emails à variables ; le chiffrement avec ses limites annoncées honnêtement ; l'aide-prompts IA (mais **rétrogradée** en coup de pouce contextuel, plus un onglet).

## Le moteur : tu peux l'agrandir, pas le casser

Plusieurs nouveautés (la « prochaine action », les nouveaux statuts, la clôture, un contact sans entreprise, l'échange par QR) ont besoin de **stocker des infos que le moteur ne connaît pas encore**. Tu as donc le droit — et le besoin — de l'**agrandir**. Ce n'est pas interdit ; ce qui est interdit, c'est de le **réécrire** ou de casser ses garanties.

- ✅ **Tu peux ajouter** ce que le nouveau modèle exige : un champ *prochaine action + date* sur la piste ; les nouvelles valeurs de *statut* et l'état de *clôture/archive* ; la possibilité d'un *contact sans entreprise* ; un *encodage compact pour le QR* dans `exchange.js`, à côté du format `.oc` ; et réutiliser le *rapprochement anti-doublon* déjà présent dans `merge.js` pour la capture.
- ❌ **Tu ne réécris pas** le moteur et tu ne casses pas ses garanties : la fusion qui **n'écrase jamais**, le **chiffrement**, et la règle **à sens unique** (le moteur ne touche jamais l'écran).
- ⚠️ **Rétrocompatibilité obligatoire** : les données déjà enregistrées et les anciens fichiers `.oc` doivent continuer à se charger. Tout nouveau champ est **optionnel** — s'il manque, le moteur ne plante pas. Fais évoluer `CONTRAT.md` et les auto-tests **délibérément** pour coller au nouveau modèle, et garde-les au vert.

## La refonte — la vision cible

**Design adaptatif (pas responsive) : deux expériences pour deux moments.** Chaque appareil est autonome (pas de synchro entre appareils). Le mobile **mène avec** la capture et l'échange ; le desktop **mène avec** la gestion. Mais aucun n'ampute l'autre : un utilisateur mobile atteint quand même tout.

**Quatre zones seulement** (au lieu des sept actuelles) :

1. **Aujourd'hui** — l'accueil. Un flux d'actions trié par date, en **3 tranches max** : *En retard · Aujourd'hui · Bientôt* (cette dernière repliée par défaut — un « mode focus » qui ne montre que le dû). Chaque ligne = une action en un tap (Écrire / Reporter / Fait ; swipe sur mobile) ; faire une action **vide la ligne** → sentiment d'avancement. **État vide positif**, jamais culpabilisant. **Jamais 40 lignes d'un coup.** Petits accès « reçu de la promo : X » et « X contacts à rattacher ». **Pas de tableau d'analytics.**
2. **Mes pistes** — la liste cherchable. Une seule vue. **Pas de carte.**
3. **Échanger** — QR et fichier.
4. **Moi** — profil, CV, modèles d'emails, aide, sauvegarde (et le coup de pouce prompts IA caché ici).

**Modèle de données :**
- L'**entreprise (piste) est l'ancre**. Un contact s'y range.
- Chaque piste vivante a un **statut simple à 3 crans** — *À contacter · En cours · Réponse* — qui nourrit un **tableau à 3 colonnes sur desktop** (poste de commandement).
- Chaque piste a une **prochaine action + une date** (ex : « Relancer le RH — jeudi »). C'est ce qui nourrit « Aujourd'hui ». Le verbe de l'action porte l'essentiel du quotidien.
- **Clôture** en un tap avec raison optionnelle (*Décroché · Refusé · Abandonné*) : la piste quitte « Aujourd'hui », reste dans « Mes pistes ».
- **Contacts orphelins tolérés** : on peut créer un contact sans entreprise ; il atterrit dans un bac **« Contacts à rattacher »**, marqué « à compléter » (réutilise l'indice de complétude), rappelé gentiment, sans blocage. L'entreprise reste la destination.
- **Anti-doublon** : rapproche sur le nom simplifié (sans accents/majuscules/« SA »). En cas de doute, **demande** (« C'est la même entreprise ? ») — jamais de fusion silencieuse.

**Capture mobile (le hub) :**
- **Capture éclair** : un nom (+ un champ si l'utilisateur veut) suffit pour enregistrer ; le reste se complète plus tard.
- **Partage entrant** : déclare l'app comme cible de partage du téléphone (PWA `share_target`) → depuis LinkedIn/navigateur, « Partager » → OpenContact pré-remplit une piste.
- Ajout de contact depuis une fiche existante, **ou** ajout générique avec la reconnaissance anti-doublon ci-dessus.
- Exploite le natif : tap-pour-appeler / SMS / WhatsApp / email depuis un contact.
- **Pas de scan de carte par OCR en v1** (trop lourd — plus tard éventuellement).

**Découverte / carte :**
- **Supprime la carte** comme vue principale (c'est la source n°1 des bugs responsive et d'une dépendance CDN). Rends le besoin géo autrement : champ adresse + bouton **« Itinéraire »** qui passe la main à l'app de navigation native (Plans / Google Maps / Waze). **Retire la dépendance Leaflet/CDN.**

**Échange :**
- **Sépare nettement deux gestes** : *Partager des pistes* (avec la promo — **jamais le privé**) vs *Sauvegarder ma base* (pour soi — **tout, y compris le privé**, chiffré, rangé discrètement dans « Moi »).
- **Donner** = une petite feuille guidée, une décision à la fois : *quoi* (cette piste / ma sélection / toutes) → *comment* (**QR**, en personne, ~5 pistes max, repli automatique vers le fichier si trop gros ; ou **fichier `.oc`** via la feuille de partage native / téléchargement / copie) → *protégé ?* (mot de passe + AES optionnels). Réaffirme au moment du geste : « ton suivi privé ne part jamais ».
- **Recevoir** = scanner un QR / ouvrir un fichier / coller du texte → **aperçu avant** (« 12 reçues, dont 4 nouvelles ») → fusion **sans écrasement** + « Annuler » ~30 s.
- **Pont** desktop→téléphone : le desktop affiche un QR, le téléphone le scanne (déplacer quelques pistes sans serveur).
- Le mobile génère **et** scanne les QR ; le desktop génère et gère les fichiers.

## Ce que tu NE fais PAS (bornes)

- Ne reconstruis pas la carte, ne réintroduis pas Leaflet.
- N'ajoute pas de tableau de bord d'analytics, de statistiques, de graphes.
- Ne **réécris** pas le moteur et ne casse pas ses garanties (fusion sans écrasement, chiffrement, sens unique) ; tu peux l'**agrandir** — voir la section « Le moteur : tu peux l'agrandir, pas le casser ». Garde les auto-tests au vert.
- Ne repars pas de zéro « pour bien faire » : réutilise le moteur, les tokens, le skin.
- N'ajoute pas de framework, de build, de dépendance externe, ni d'appel réseau au-delà de ce qui existe déjà (géocodage, fonds de carte si tu en gardes une trace, polices auto-hébergées).
- Ne sur-conçois pas : pas d'abstractions spéculatives, pas de gestion d'erreurs pour des cas qui ne peuvent pas arriver, pas de multi-domaine (on reste mono-domaine). Fais la chose la plus simple qui marche bien.
- Ne multiplie pas les points d'entrée pour une même action (c'est le défaut actuel) : une action = un endroit évident.

## Comment travailler (qualité)

**Tu as la main sur l'exécution.** Les décisions de ce brief (les 4 zones, le modèle de données, ce qu'on garde/coupe) sont des arbitrages déjà tranchés : respecte-les. Mais le *comment* — la mise en écran, les micro-interactions, les détails qui rendent l'app fluide et agréable — est à toi. Traite mes descriptions comme l'**intention et la direction**, pas comme des maquettes à recopier. Si tu vois un motif plus simple ou plus élégant qui sert la même intention et la boussole « simplicité », **propose-le et applique-le**. Tu es plus imaginatif que mes exemples — sers-t'en.

- **Mobile d'abord** (conçois pour 390 px de large, le desktop est l'élargissement), puis desktop.
- **Écran par écran**, pas en big-bang. Commence par ce que tu juges le plus structurant (probablement « Aujourd'hui » et la capture mobile).
- **Vérifie en lançant réellement l'app** (`python3 -m http.server`) et en parcourant les vrais parcours à 390 px : ajouter une piste, écrire un email, faire une relance, partager par QR, recevoir un fichier. Ne déclare rien « fait » sans l'avoir observé fonctionner. Lance aussi les auto-tests (`?test`).
- **Cibles tactiles 44 px, saisie à 16 px** (pas de zoom iOS), `safe-area-inset` respectés — l'existant le fait déjà bien, garde ce niveau.
- Soigne les micro-frictions : un tap doit suffire là où c'est possible, l'app doit répondre à « quoi faire maintenant ».

Quand tu as de quoi agir, agis. Si tu hésites sur un arbitrage produit, propose une recommandation plutôt qu'un catalogue d'options. Commence par me présenter ton plan de découpage, puis attaque.
