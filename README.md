# Master Shifter

Viewer statique Svelte 5 pour plannings de benevoles synchronises depuis Grist.

## Developpement

```bash
npm install
npm run dev
```

Le projet embarque des donnees de demo dans `static/data/demo/schedule.json`, donc l'interface fonctionne sans cle Grist.

## Synchronisation Grist

1. Copie `.env.example` vers `.env`.
2. Renseigne `GRIST_API_KEY`.
3. Configure les projets dans `grist.projects.json`.
4. Lance :

```bash
npm run sync:data
```

Le script ecrit `static/data/projects.json` et `static/data/<slug>/schedule.json`.
Ces fichiers sont servis par GitHub Pages, ce qui evite d'exposer la cle API et limite les appels Grist cote visiteurs.

Pour decouvrir les noms exacts des tables et colonnes d'un document :

```bash
npm run inspect:grist -- --doc <document-id>
```

## GitHub Pages

Ajoute le secret `GRIST_API_KEY` dans le depot GitHub, puis active GitHub Pages sur "GitHub Actions".

Le workflow calcule automatiquement le `PUBLIC_BASE_PATH` pour une URL de depot, par exemple `/master-shifter`.
Si tu utilises un domaine custom ou une autre base, ajoute une variable GitHub Actions `PUBLIC_BASE_PATH`.

Les sous-URLs de projet sont du type :

- `/demo`
- `/mon-festival`
- `/ccpl-2026`

Sur GitHub Pages projet, elles deviennent `/nom-du-repo/demo`, etc.

## Mise a jour des donnees

Le workflow `.github/workflows/deploy.yml` ne tourne pas toutes les heures. Il se lance :

- a chaque push sur `main`
- manuellement depuis l'onglet GitHub Actions
- via un `repository_dispatch` nomme `grist-updated`

La synchro compare les donnees publiques generees. Si Grist n'a pas change, le workflow s'arrete avant le build et le redeploiement.
Quand les donnees changent, `static/data` est commit automatiquement avec `[skip ci]`, puis GitHub Pages est redeploye.

### Declenchement manuel

Depuis GitHub : Actions -> Deploy GitHub Pages -> Run workflow.

Depuis un terminal ou un petit relais :

```bash
GITHUB_REPOSITORY=owner/master-shifter GITHUB_TOKEN=<token> npm run hook:sync -- --project aurillac
```

Ajoute `--force` pour redeployer meme si les donnees n'ont pas change.

### Webhook Grist instantane

Dans Grist, cree un webhook sur les tables qui changent le planning :

- `Assignations`
- `Benevoles`
- `Horaires`
- `Types_de_quetes`
- `Lieux`
- `Quetes`

Si ton outil de webhook permet de definir un body JSON custom, appelle l'API GitHub :

```bash
curl -X POST "https://api.github.com/repos/owner/master-shifter/dispatches" \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <token>" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -d '{"event_type":"grist-updated","client_payload":{"project":"aurillac"}}'
```

Si Grist envoie seulement son payload natif, passe par un petit relais comme Pipedream, Make ou Cloudflare Worker, puis fais-lui envoyer le `repository_dispatch` ci-dessus.
