# Tests de bout en bout (Playwright)

Outillage de développement — rien ici n'est chargé par l'application.

```
node tests/e2e/tous.mjs          # tout : unitaires (?test) + scénarios
node tests/e2e/e2e-verrou.mjs    # un seul scénario
```

Prérequis : Node ≥ 20 et Playwright avec un Chromium. La résolution est
automatique (`/opt/pw-browsers`, `PLAYWRIGHT_BROWSERS_PATH`) et se force
par `OC_PLAYWRIGHT=<chemin de index.mjs>` / `OC_CHROMIUM=<chemin du
binaire>`. Les captures vont dans `captures/` (non versionné).

| Scénario | Ce qu'il prouve |
|---|---|
| `unitaires.mjs` | Les auto-tests `?test` du moteur — tous verts, zéro erreur console |
| `e2e-verrou.mjs` | Création du profil protégé (code, phrase, sauvegarde bloquante), scellement `OCV1.` vérifié en IndexedDB, mauvais code + délai, clavier, thèmes |
| `e2e-recuperation.mjs` | « Code oublié ? » : phrase prouvée → rotation complète (gén. +1), ancien code refusé, sauvegarde obligatoire |
| `e2e-envoi.mjs` | Envoi direct Gmail intercepté, « Depuis {adresse} », expiration → reconnexion sans perdre le brouillon, `mailto:` intact |
| `e2e-campagne.mjs` | Bifurcation → assistant → contrôle → envois du jour interceptés, plafond, **fenêtre d'envoi (samedi = retenu)**, réponse → relances annulées |
| `e2e-ia.mjs` | « Proposer un brouillon » intercepté, quota (429) proprement, rien de perdu |
| `e2e-analyse.mjs` | « Depuis mes e-mails » : prompt copié, aperçu multi-sélection, lien piégé neutralisé, confiance non transmise |
| `e2e-oauth-sw.mjs` | Le service worker ne détourne jamais `oauth.html` ; le jeton revient par postMessage |
