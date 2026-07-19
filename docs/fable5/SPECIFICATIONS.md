# OpenContact — spécifications consolidées du chantier connecté

> **Statut :** référentiel de périmètre avant validation du plan UX final  
> **Dernière mise à jour :** 16 juillet 2026  
> **Chantier :** profil protégé, appareil principal, envoi direct, campagnes,
> Compagnon, IA, analyse des e-mails et MCP local

## 1. Rôle de ce document

Ce document réunit en un seul endroit ce qui doit être construit, les raisons
du chantier, les décisions déjà prises, les contraintes et les limites. Il doit
permettre à une personne ou à un agent de reprendre le travail sans relire les
conversations précédentes.

Il ne remplace pas :

- `CLAUDE.md`, qui fait autorité sur le produit, l'architecture et l'UI ;
- `CONTRAT.md`, qui fait autorité sur les formats et invariants de données ;
- `docs/fable5/CONTEXT.md`, qui conserve les décisions durables validées ;
- le futur `docs/fable5/UX-PLAN.md`, qui décrira l'expérience finale validée ;
- `docs/fable5/PLAN.md`, qui ordonne et suit les travaux ;
- `docs/fable5/HANDOFF.md`, qui indique le dernier checkpoint terminé.

En cas de divergence, `CLAUDE.md` et `CONTRAT.md` restent prioritaires. Une
nouvelle décision du mainteneur doit être répercutée dans `CONTEXT.md` et dans
le présent document.

### Légende

- **Validé** : décision acquise, à ne pas redemander ni modifier sans accord.
- **À concevoir** : résultat attendu connu, détail laissé au plan UX ou à
  l'implémentation.
- **À vérifier** : dépendance externe ou hypothèse à confirmer dans une
  documentation officielle au moment de développer.
- **Reporté** : explicitement hors de la première version du chantier.

## 2. Vision et résultat attendu

OpenContact reste une PWA local-first de motivation et d'action, utilisable
sans compte, sans serveur OpenContact et sans analytics. Le chantier ajoute des
capacités connectées facultatives sans transformer l'application en CRM cloud.

L'utilisateur doit pouvoir :

1. protéger ses données et secrets avec un coffre local ;
2. désigner un appareil principal et reprendre le contrôle en cas de perte ;
3. connecter une messagerie et envoyer depuis OpenContact ;
4. préparer puis exécuter une campagne de prospection simple et encadrée ;
5. installer, s'il le souhaite, un Compagnon local pour les tâches impossibles
   ou fragiles dans un navigateur ;
6. utiliser une IA locale, une clé API ou un abonnement compatible ;
7. lancer depuis OpenContact l'analyse d'un périmètre d'e-mails ;
8. contrôler les propositions avant toute création ou fusion de fiches.

Le chemin historique reste intact : l'app de base fonctionne sans profil
protégé, connexion, IA ou Compagnon, et `mailto:` demeure le repli universel.

## 3. Principes transversaux validés

### 3.1 Local-first et absence de service permanent

- Aucun compte OpenContact, backend permanent, stockage distant OpenContact ou
  analytics n'est ajouté.
- Les données métier, états de campagne, journaux et secrets restent sur les
  appareils de l'utilisateur.
- Les API de Gmail, Microsoft ou d'un fournisseur d'IA sont des services tiers
  sollicités par l'utilisateur ; elles ne constituent pas un backend
  OpenContact.
- Une action nécessitant le réseau peut être préparée hors ligne mais doit
  attendre une connexion pour s'exécuter.
- Une indisponibilité externe ne doit jamais bloquer l'accès aux pistes locales.

### 3.2 Contrôle de l'utilisateur

- OpenContact prépare par défaut ; l'utilisateur décide avant l'envoi, le
  lancement d'une campagne et l'import de résultats.
- Aucune IA ne crée, modifie ou supprime directement une donnée.
- Toute donnée entrante passe par `parseInput`, la normalisation, la détection
  des doublons et `mergePreviewInto` avant fusion.
- Une fusion ne remplit que les champs vides ; une divergence est montrée et
  l'existant est conservé.
- Les gestes lourds restent précédés d'un aperçu et suivis d'une possibilité
  d'annulation conformément à `CLAUDE.md`.

### 3.3 Secrets et données privées

- Jetons OAuth, clés API, phrases et mots de passe ne sont jamais stockés en
  clair.
- Les mots de passe d'application utilisés par le Compagnon restent dans le
  trousseau du système d'exploitation.
- Le privé ne sort jamais dans un partage communautaire. La synchronisation
  entre les appareils d'une même personne demeure le seul canal autorisé à
  transporter le suivi privé.
- Le mainteneur ne finance pas les usages de messagerie ou d'IA : chaque
  utilisateur emploie son abonnement, son quota ou sa clé.

### 3.4 Architecture et compatibilité

- La logique métier reste dans `engine/`, sans DOM ; `ui/` l'appelle dans un
  seul sens.
- Les formats et clés sont versionnés. Aucun format existant n'est cassé et
  aucune clé de stockage existante n'est renommée.
- Toute évolution du contrat est documentée dans `CONTRAT.md` et testée dans
  `tests.js` dans le même changement.
- Les nouvelles bibliothèques de la PWA sont vendorisées, sans CDN ni étape de
  build. Le Compagnon constitue un projet distinct et facultatif.

## 4. Profil protégé et coffre local

### 4.1 Périmètre validé

Le profil protégé est facultatif pour l'utilisation de base, mais obligatoire
avant de connecter une messagerie, enregistrer un secret d'IA, associer le
Compagnon ou automatiser une campagne.

La V1 montre un seul profil. L'architecture peut préparer plusieurs profils,
mais aucune interface multi-profils n'est prévue dans cette version.

Le parcours doit couvrir :

- l'activation volontaire du profil protégé ;
- la création d'un PIN ;
- la remise d'une phrase de secours forte ;
- une première sauvegarde chiffrée ;
- le verrouillage et le déverrouillage ;
- la ré-authentification avant les gestes sensibles ;
- la désactivation ou migration sans perte de données.

### 4.2 Comportement de sécurité validé

- Le même PIN protège le profil sur ses appareils associés.
- Le verrouillage automatique est fixé à 5 minutes sur mobile et 15 minutes sur
  ordinateur, sans réglage en V1.
- La biométrie ou une passkey compatible n'est qu'un accélérateur facultatif ;
  le PIN reste le repli.
- Le verrouillage de l'interface n'interrompt pas une campagne déjà relue et
  validée.
- La phrase de liaison existante entre appareils et la phrase de secours sont
  deux secrets distincts, avec deux usages distincts.

### 4.3 Direction technique à implémenter

- Une clé maîtresse chiffre les valeurs sensibles.
- Cette clé est enveloppée par les moyens d'accès autorisés : PIN, phrase de
  secours et, si disponible, mécanisme PRF/biométrique.
- Les valeurs chiffrées utilisent une enveloppe versionnée, prévue sous le
  préfixe `OCV1.`.
- La métadonnée du coffre est prévue sous une nouvelle clé `oc_vault_v1`.
- La couche de stockage doit lire les anciennes valeurs claires, permettre une
  migration sûre et ne jamais laisser un état partiellement migré.

Les algorithmes, paramètres cryptographiques, formats binaires et mécanismes de
rotation seront figés avec des vecteurs de test avant l'interface.

### 4.4 Critères d'acceptation

- Cycle chiffrer/déchiffrer et mauvais PIN testés.
- Rotation et récupération testées avec des vecteurs stables.
- Activation et désactivation sans perte.
- Aucun secret retrouvé en clair dans IndexedDB, localStorage, les logs ou une
  sauvegarde.
- Sans profil protégé, l'expérience actuelle reste pleinement fonctionnelle et
  n'est pas alourdie.

## 5. Appareil principal et récupération

### 5.1 Périmètre validé

Le terme visible est **« appareil principal »**. Le nom interne éventuel « Roi »
ne doit jamais apparaître dans l'interface.

L'appareil principal apporte une autorité locale sur le groupe d'appareils de
la même personne. Il doit permettre :

- de voir les appareils associés ;
- de transférer le rôle principal ;
- de verrouiller ou retirer un appareil ;
- de révoquer un appareil perdu ;
- de faire appliquer une commande lorsqu'un appareil hors ligne se reconnecte ;
- de déclencher une récupération d'urgence avec la phrase de secours.

### 5.2 Direction technique à implémenter

- Chaque appareil possède une identité signée.
- Un registre versionné par générations, prévu sous `oc_devring_v1`, décrit les
  appareils autorisés et révoqués.
- Les commandes sensibles sont signées et vérifiées avant application.
- Une révocation fait évoluer la génération et la protection afin qu'un ancien
  appareil ne puisse pas réintégrer silencieusement le groupe.
- Une commande hors ligne est conservée et appliquée lors d'une reconnexion.

Une suppression distante demeure une instruction de bonne foi : un appareil
qui ne se reconnecte jamais ne peut pas être effacé magiquement. L'interface
doit être honnête sur cette limite.

### 5.3 Récupération d'urgence validée

La récupération avec la phrase de secours :

1. révoque l'ancien appareil principal ;
2. renouvelle la protection et la phrase de secours ;
3. oblige l'utilisateur à produire une nouvelle sauvegarde chiffrée avant de
   terminer ;
4. explique que d'anciennes copies déjà exportées ne peuvent pas être effacées
   à distance.

## 6. Connexions de messagerie et envoi direct

### 6.1 Résultat attendu

Depuis « Prospecter » ou une feuille d'écriture, l'utilisateur choisit des
pistes, contrôle les destinataires, le sujet et le contenu, voit clairement
l'adresse d'expédition puis envoie sans ouvrir une autre application.

`mailto:` reste toujours proposé lorsque l'envoi direct est indisponible ou
non configuré.

### 6.2 Périmètre V1 validé

| Fournisseur | Envoi V1 | Lecture pour réponses/analyse | Repli |
|---|---|---|---|
| Gmail | API Gmail depuis la PWA ; authentification utilisateur | Compagnon : mot de passe d'application en parcours principal, OAuth personnel en avancé | `mailto:` |
| Outlook / Hotmail | Microsoft Graph depuis la PWA ; authentification utilisateur | Compagnon : OAuth | `mailto:` |
| SMTP générique | Pas depuis le navigateur ; prévu via le Compagnon | IMAP/SMTP via Compagnon selon fournisseur | `mailto:` |
| Yahoo, iCloud, Zoho, Proton | **Reporté** après la V1 | **Reporté** ; Proton peut nécessiter un composant local spécifique | `mailto:` |

Les capacités, politiques OAuth, quotas et conditions des fournisseurs doivent
être revérifiés dans leurs documentations officielles au moment de chaque
intégration.

### 6.3 Contraintes techniques

- Une PWA ne peut pas ouvrir librement une connexion SMTP TCP ; le SMTP passe
  donc par le Compagnon, jamais directement par le navigateur.
- Les clients OAuth de navigateur n'embarquent aucun secret confidentiel.
- Les jetons sont placés dans le coffre et renouvelés ou redemandés proprement.
- Une expiration d'autorisation ne doit pas faire perdre le brouillon.
- L'identité d'expédition est affichée avant confirmation.
- Chaque tentative porte un identifiant idempotent afin qu'une reconnexion ou
  un rattrapage ne provoque pas un double envoi.
- En cas de résultat réseau incertain, l'état reste à vérifier ; OpenContact ne
  relance pas aveuglément.

### 6.4 Autorisations, validation et coûts

- Gmail et Microsoft nécessitent des applications OAuth déclarées et des
  domaines/URL de redirection correctement configurés.
- Selon les scopes, le volume d'utilisateurs et les politiques alors en
  vigueur, une validation de l'éditeur, un consentement administrateur ou une
  revue de sécurité peuvent être exigés.
- Aucun coût fournisseur précis n'est figé dans cette spécification : quotas,
  validations et conditions doivent être chiffrés avant publication.
- L'utilisation est imputée au compte de messagerie de l'utilisateur ;
  OpenContact ne vend ni n'héberge un service d'envoi.

## 7. Campagnes de prospection

### 7.1 Modèle V1 validé

La campagne V1 est volontairement prescriptive :

- un premier message à J0 ;
- une première relance à J+7 ;
- une seconde relance à J+14 ;
- maximum 15 envois par jour ;
- fenêtre d'envoi raisonnable imposée ;
- arrêt automatique dès qu'une réponse est détectée, non désactivable ;
- mention d'opposition imposée ;
- aucun constructeur libre de séquence.

Le modèle interne « Cadré » peut être préparé dans le moteur, mais reste
invisible en V1. Il ne doit pas complexifier le parcours visible.

### 7.2 Parcours fonctionnel attendu

Le parcours couvre au minimum :

1. la sélection des pistes ;
2. le choix de l'objectif ;
3. la préparation des trois messages ;
4. la personnalisation et le contrôle destinataire par destinataire ;
5. la vérification du compte d'envoi et des règles ;
6. la validation sensible avec le profil protégé ;
7. le suivi, la pause, la reprise ou l'annulation ;
8. l'arrêt individuel d'une séquence lorsqu'une réponse est détectée.

L'emplacement exact, le niveau de relecture groupée et la microcopie seront
figés dans le plan UX. Le principe acquis reste : **préparer par défaut,
l'utilisateur décide**.

### 7.3 Moteur et exécution

- La machine à états de campagne vit dans `engine/campaign.js` et reste pure.
- Le stockage prévu est versionné sous `oc_campaigns_v1`.
- Les envois portent des identifiants stables et rejouables sans double envoi.
- Lorsque la PWA est ouverte, elle peut exécuter et rattraper les actions dues.
- Pour continuer quand la PWA est fermée, une campagne doit être explicitement
  confiée au Compagnon.
- Le verrouillage de l'écran ne révoque pas une campagne déjà autorisée.
- Le journal d'exécution est privé, local et compréhensible par l'utilisateur.

## 8. Le Compagnon local

### 8.1 Rôle validé

Le Compagnon est une application locale facultative, prévue avec Tauri. Il
prend en charge les capacités qu'un navigateur ne peut pas garantir :

- conserver les secrets dans le trousseau du système ;
- utiliser IMAP/SMTP ou des composants locaux ;
- poursuivre une campagne lorsque la PWA est fermée ;
- détecter les réponses ;
- exécuter Ollama et les runtimes d'abonnement compatibles ;
- exposer un serveur MCP local limité.

L'application OpenContact reste utile sans lui.

### 8.2 Association et transport validés

- Le Compagnon est associé par un code court dans un parcours contrôlé.
- Il apparaît une seule fois dans « Mes appareils », pas dans plusieurs menus.
- La PWA choisit automatiquement entre communication locale et P2P.
- Les termes techniques comme « localhost » et « P2P » ne sont pas exposés à
  l'utilisateur.
- Les missions sont idempotentes : deux canaux ou une reconnexion ne doivent
  jamais exécuter deux fois la même action.
- Une mission sensible possède une portée, une expiration et un moyen de
  révocation.

### 8.3 Points à vérifier

- ~~Fiabilité de Trystero dans l'environnement du Compagnon~~ — **tranché à
  l'implémentation (C8, juillet 2026)** : le Compagnon n'ouvre pas de session
  P2P directe. Le repli sans serveur permanent est la **synchronisation privée
  « Mes appareils » déjà éprouvée** : depuis un téléphone, campagnes et bons
  signés voyagent par la sync chiffrée jusqu'à l'ordinateur associé, qui remet
  la mission au Compagnon par le canal local — une seule fois (`mid`
  idempotent). Aucun écran ne promet autre chose ; le choix reste automatique
  et sans jargon (D4 respecté).
- Signature, distribution et mises à jour du binaire sur les systèmes visés
  (la CI construit des paquets **non signés** sur les trois OS à la demande ;
  la signature reste un geste du mainteneur).
- Compatibilité réelle de chaque fournisseur IMAP/SMTP et des trousseaux OS.

## 9. Connexions IA

### 9.1 Options validées

OpenContact doit rester indépendant d'un fournisseur et proposer trois familles
d'exécution :

1. **Locale** : Ollama via le Compagnon, utilisable sans facturation API et,
   une fois le modèle installé, hors ligne.
2. **Clé API de l'utilisateur** : OpenAI, Anthropic, Gemini et OpenRouter,
   selon les contraintes navigateur/Compagnon de chaque service.
3. **Abonnement compatible** : ChatGPT via Codex App Server dès la V1 ; Claude
   uniquement si une documentation officielle confirme durablement que cet
   usage par OpenContact est autorisé.

L'absence d'IA ne retire aucune fonction essentielle : modèles manuels,
priorisation locale et `mailto:` restent disponibles.

### 9.2 Règles d'utilisation

- L'utilisateur choisit et connecte son propre fournisseur.
- Sa clé, son abonnement ou son infrastructure locale porte le coût et le quota.
- OpenContact montre le fournisseur actif avant d'envoyer du contenu.
- Une génération produit toujours un brouillon à relire, jamais un envoi.
- Les erreurs de clé, quota, modèle absent ou runtime indisponible sont
  explicites et proposent un repli manuel.
- Le contenu transmis est limité à ce qui est nécessaire à la mission.
- Les clés restent dans le coffre ou le trousseau OS ; elles ne sont jamais
  inscrites dans un prompt, un journal ou un export.

### 9.3 À vérifier avant intégration

- Interfaces et conditions exactes de Codex App Server au moment du codage.
- Autorisation officielle d'utiliser un abonnement Claude depuis une application
  tierce ; sans confirmation, Claude reste disponible uniquement par clé API.
- CORS, limites, formats structurés et politiques de rétention de chaque API.

## 10. « Analyser mes e-mails »

### 10.1 Faisabilité retenue

OpenContact ne peut pas compter sur le connecteur e-mail déjà autorisé dans le
compte ChatGPT ou Claude grand public de l'utilisateur. Il n'existe pas de
parcours portable permettant à OpenContact de déclencher arbitrairement une
tâche dans ce compte et de réutiliser ses connecteurs privés.

MCP ne renverse pas ce sens de communication : un client IA peut appeler les
outils exposés par un serveur MCP, mais un serveur MCP OpenContact ne donne pas
à OpenContact le pouvoir de piloter le compte ChatGPT ou Claude de
l'utilisateur.

La solution retenue est donc une orchestration locale :

1. l'utilisateur lance la mission depuis OpenContact ;
2. il choisit un compte, un dossier ou une période et voit le périmètre ;
3. le Compagnon lit les messages avec l'autorisation de messagerie propre à
   OpenContact ;
4. le runtime IA choisi analyse seulement ce périmètre ;
5. il extrait entreprises, personnes, fonctions, coordonnées et informations
   utiles dans un JSON OpenContact versionné ;
6. OpenContact valide et normalise ce JSON ;
7. les doublons, compléments et divergences sont présentés ;
8. l'utilisateur accepte ou écarte les propositions avant création/fusion.

### 10.2 Protection contre les contenus hostiles

- Le texte d'un e-mail est toujours traité comme une donnée, jamais comme une
  instruction pour l'agent.
- Le schéma de sortie est strict et toutes les valeurs sont non fiables jusqu'à
  validation.
- Les liens, pièces jointes, scripts et instructions inclus dans les messages
  ne sont pas exécutés.
- Les corpus de test contiennent des tentatives d'injection, des signatures
  trompeuses, des doublons et des données contradictoires.
- Une mission annulée ou échouée ne crée aucune fiche partielle.

### 10.3 Confidentialité et hors-ligne

- Le périmètre et le fournisseur sont visibles avant analyse.
- Avec Ollama, l'analyse peut rester entièrement locale.
- Avec une API distante, l'utilisateur est informé que les extraits nécessaires
  quittent son appareil vers le fournisseur choisi.
- Les résultats reçus peuvent être contrôlés et fusionnés hors ligne.
- Aucun message brut n'est conservé sur un serveur OpenContact.

## 11. MCP local

Le MCP de la première version est local et facultatif, exposé par le Compagnon.
Son but est de permettre à une IA compatible de consulter un périmètre limité
et de produire des propositions.

Règles validées :

- lecture minimale et explicitement autorisée ;
- aucune suppression exposée ;
- aucune écriture directe dans le stockage ;
- toute proposition revient dans le même aperçu d'import contrôlé ;
- journal local des actions sensibles ;
- arrêt et révocation possibles depuis OpenContact.

Un MCP distant, un relais public ou un mécanisme permettant de joindre le
navigateur depuis une IA distante sont reportés. Un futur relais devrait être
facultatif, auto-hébergeable et sans stockage permanent.

## 12. Intégration UX déjà cadrée

Les décisions suivantes sont acquises ; le plan UX final doit les concrétiser
sans les réinterpréter :

- conserver la navigation principale actuelle ;
- ne pas ajouter de nouvel onglet en V1 ;
- utiliser « Prospecter » comme départ des campagnes ;
- montrer dans « Aujourd'hui » les actions et états au moment utile ;
- placer connexions et réglages dans « Moi » ;
- présenter le Compagnon une seule fois dans « Mes appareils » ;
- penser d'abord le mobile, puis une vraie variante ordinateur ;
- respecter le breakpoint unique à 901 px et les motifs de `CLAUDE.md` ;
- rester prescriptif, avec une seule décision ou action principale à la fois ;
- ne pas exposer le jargon technique.

**À concevoir dans `UX-PLAN.md` :** emplacements détaillés, hiérarchie des
écrans, relecture de campagne, foyer exact de l'analyse/import IA, états vides,
microcopie, comportements 390 px/1280 px et découverte du Compagnon.

Tant que ces détails ne sont pas validés, ils ne doivent pas être transformés
en règles définitives dans le code.

## 13. États d'erreur et replis obligatoires

| Situation | Comportement attendu |
|---|---|
| Hors ligne | Préparation locale conservée ; envoi différé ou `mailto:` proposé |
| Autorisation expirée | Reconnexion sans perte du brouillon ou de la campagne |
| Compagnon absent | Fonctions locales intactes ; expliquer brièvement ce qui nécessite le Compagnon |
| Compagnon momentanément indisponible | Mission en attente, révocable, jamais dupliquée |
| Coffre verrouillé | Lecture sensible masquée ; PIN demandé au geste nécessaire |
| Résultat d'envoi incertain | État « à vérifier » ; pas de nouvelle tentative aveugle |
| Réponse détectée | Relances restantes annulées pour ce destinataire |
| Quota fournisseur atteint | Pause explicite et repli manuel, sans perte |
| Clé ou modèle IA invalide | Diagnostic court, changement de fournisseur ou modèle manuel |
| JSON IA invalide | Rejet sans mutation, possibilité de recommencer |
| Doublon ou divergence | Aperçu détaillé ; existant conservé par défaut |
| Analyse sans résultat | Aucun changement ; expliquer simplement le périmètre analysé |
| Appareil révoqué hors ligne | Commande appliquée à sa reconnexion ; limite expliquée |

Les formulations exactes seront définies par le plan UX ; le comportement et
l'absence de perte sont obligatoires.

## 14. Validation et qualité

Chaque incrément doit respecter la checklist de `CLAUDE.md` et inclure les
tests proportionnés au risque.

### 14.1 Moteur

- `?test` reste entièrement vert.
- Chiffrement : mauvais PIN, rotation, migration, reprise après interruption.
- Appareils : signature invalide, convergence, révocation hors ligne, retour
  d'un appareil banni, récupération.
- Campagnes : dates limites, reprise, arrêt sur réponse et preuve
  anti-double-envoi par rejeu du journal.
- Import IA : schémas invalides, doublons, divergences et prompt injection.

### 14.2 Interface

- Parcours réels à 390 × 844 tactile et 1280 × 800.
- Thèmes clair et sombre.
- Cibles tactiles d'au moins 44 px sur mobile.
- États vide, chargé, hors ligne, expiré, verrouillé, quota atteint et erreur.
- Aucun secret ni contenu privé dans la console.
- Brouillons et choix conservés après reconnexion, fermeture de feuille ou
  verrouillage lorsque le geste n'a pas été explicitement annulé.

### 14.3 Intégrations

- Tests avec doubles Gmail/Graph/SMTP/IMAP/IA avant les essais réels.
- Essais réels limités et contrôlés pour chaque fournisseur publié.
- Relecture des scopes OAuth, quotas et conditions officielles avant sortie.
- CSP ajustée au strict nécessaire.

## 15. Méthode de livraison et continuité

Après validation du plan UX, `PLAN.md` doit être réordonné pour traiter le plus
tôt possible les travaux complexes, structurants, risqués ou incertains, tout
en respectant leurs dépendances techniques.

Le travail se fait une phase à la fois. Chaque phase doit :

- tenir dans une session raisonnable ;
- produire un état fonctionnel ou un contrat moteur testable ;
- être testée, commitée et poussée ;
- mettre à jour `PLAN.md` et `HANDOFF.md` ;
- indiquer la prochaine action exacte.

Fable5 peut poursuivre les phases tant que son quota le permet. Codex peut
reprendre après n'importe quel checkpoint terminé en lisant `CLAUDE.md`,
`CONTRAT.md`, `CONTEXT.md`, le présent document, `UX-PLAN.md`, `PLAN.md`,
`HANDOFF.md` et les derniers commits. Le nouvel agent suit les décisions
validées ; il ne réinvente pas l'UX.

## 16. Éléments explicitement reportés

- interface multi-profils ;
- modèle de campagne « Cadré » visible et constructeur libre ;
- Yahoo, iCloud, Zoho et Proton en intégration native ;
- suivi des ouvertures ;
- MCP distant et relais OpenContact ;
- backend ou compte OpenContact ;
- portage Capacitor ;
- automatisation reposant sur les connecteurs privés d'un compte ChatGPT ou
  Claude grand public.

Ces éléments ne doivent pas élargir silencieusement la V1. Ils nécessitent un
nouvel arbitrage produit, sécurité, coûts et maintenance.

## 17. Points restant réellement ouverts

État au 19 juillet 2026 — après livraison du chantier :

1. ~~Le plan UX détaillé et sa validation par le mainteneur~~ — validé le
   16 juillet 2026 (`UX-PLAN.md`).
2. ~~Les formats internes complets, paramètres cryptographiques et
   migrations~~ — figés avec vecteurs de test (`CONTRAT.md`, `?test`).
3. ~~La fiabilité du transport P2P dans le Compagnon~~ — tranché : repli par
   la sync privée « Mes appareils » (voir §8.3), aucune session P2P directe.
4. Les conditions officielles et durables d'un abonnement Claude dans une
   application tierce — **toujours ouvert** : Claude reste par clé API.
   L'abonnement ChatGPT est, lui, livré via le mode non interactif documenté
   de l'outil officiel Codex (`codex exec --output-last-message`, bac à sable
   lecture seule), exécuté par le Compagnon.
5. Les politiques OAuth, scopes, validations et quotas exacts lors de la mise
   en production Gmail/Microsoft — **toujours ouvert** (geste mainteneur :
   déclarer les applications ; l'option avancée « son propre client » permet
   d'essayer avant).
6. La signature, distribution et maintenance du Compagnon sur les OS ciblés —
   **toujours ouvert** pour la signature et la publication ; la construction
   multi-OS non signée est couverte par la CI (`paquets.yml`).

Tout autre choix décrit comme **validé** dans ce document est considéré acquis
jusqu'à décision contraire explicite du mainteneur.
