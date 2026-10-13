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

Live at `https://supply.ultra.io` (public), served by the Worker `uos-circulating-supply`
in the Cloudflare account that holds the `ultra.io` zone. No secrets, environment
variables, API keys or build step are needed.

Every push to `main` redeploys automatically via Cloudflare Workers Builds (Worker →
Settings → Build, connected to this repo through the Cloudflare GitHub app). It runs
`npx wrangler deploy`, which also attaches the `supply.ultra.io` custom domain declared in
`wrangler.toml`; Cloudflare manages its DNS record and certificate.

Build settings, for reconnecting if ever needed: production branch `main`, build command
*(empty)*, deploy command `npx wrangler deploy`, root directory `/`. The project name must
match `name` in `wrangler.toml`.

Check a deploy: `https://supply.ultra.io/circulating-supply` returns a number and
`/breakdown` the JSON.

Manual alternative: with Node.js installed, run `npx wrangler login` and then
`npx wrangler deploy` from this folder.

## Changing excluded wallets

Edit the `EXCLUDED` array in `src/worker.js` and redeploy.
