# UOS Circulating Supply API

Cloudflare Worker that serves the live circulating supply of UOS, read directly from the
Ethereum ERC-20 contract `0xD13c7342e1ef687C5ad21b27c2b65D772cAb5C8c`.

```
circulating = ERC-20 totalSupply (1B) - balances of excluded addresses
```

Excluded: the emission contract and the team wallets listed in `EXCLUDED` in
`src/worker.js`. The bridge is not excluded (bridged UOS circulates on Ultra mainnet).
Because everything is read from the ERC-20 contract, the figure can never exceed 1B.

## Endpoints

| Path | Returns |
|---|---|
| `/circulating-supply` | plain-text number, e.g. `674325064.1666` (CoinGecko / CMC format) |
| `/total-supply` | plain-text number, `1000000000.0000` |
| `/breakdown` | JSON: totals, block number, each excluded address with label and balance |

Data is cached for 5 minutes. If every RPC is down, the last good value is served
(`"stale": true` in `/breakdown`); a cold instance with no data returns `503`.

## Deploy

Target: `https://supply.ultra.io`, served by a Worker in the Cloudflare account that holds
the `ultra.io` zone. No secrets, environment variables, API keys or build step are needed.

1. **Create the Worker from this repo.** Workers & Pages → Create → Import a repository →
   connect GitHub (install the Cloudflare app on `ultraio`, limited to this repo) → select
   `uos-circulating-supply`. Settings:
   - Project name: `uos-circulating-supply` (must match `name` in `wrangler.toml`)
   - Production branch: `main`
   - Build command: *(empty)*
   - Deploy command: `npx wrangler deploy`
   - Root directory: `/`

   Save and Deploy. Every push to `main` redeploys automatically from then on.
2. **Check the workers.dev URL** shown after the build: `/circulating-supply` should return
   a number and `/breakdown` the JSON.
3. **Add the domain.** Worker → Settings → Domains & Routes → Add → Custom domain →
   `supply.ultra.io`. Cloudflare creates the DNS record and certificate; it takes precedence
   over the `*.ultra.io` wildcard for this hostname only.
4. **Check** `https://supply.ultra.io/circulating-supply`.

Leave the workers.dev URL enabled: `wrangler deploy` re-enables it on every deploy unless
`workers_dev = false` is set in `wrangler.toml`. It serves the same public data.

Manual alternative (no GitHub connection): with Node.js installed, run `npx wrangler login`
and then `npx wrangler deploy` from this folder, then do step 3.

## Changing excluded wallets

Edit the `EXCLUDED` array in `src/worker.js` and redeploy.
