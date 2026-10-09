# Maison Recipes

A public recipe-sharing website. Visitors can browse recipes, scale servings, and convert measurements. Only the owner can create, edit, import, or delete recipes.

## Stack
React, Vite, TypeScript, Cloudflare Workers, Cloudflare D1, Cloudflare Access.

## Deploy
Connect this repository to **Cloudflare Workers Builds** using production branch `main`, build command `npm run build`, deploy command `npx wrangler deploy`, root directory `/`.

Database `maison-recipes` is already provisioned and referenced in `wrangler.toml`.

**Important:** Cloudflare Access must protect `/api/admin/*`, with an allow policy for only the owner's email. Configure `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` as Worker environment variables before enabling writes. No secrets should be committed to this public repository.
