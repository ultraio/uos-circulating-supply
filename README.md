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

**Dashboard (no tooling):** Cloudflare dashboard → Workers & Pages → Create → Worker →
name it `uos-circulating-supply` → Deploy → Edit code → paste `src/worker.js` → Deploy.

**CLI:** with Node.js installed, from this folder: `npx wrangler login`, then `npx wrangler deploy`.

The URL will be `https://uos-circulating-supply.<your-subdomain>.workers.dev`. A custom
domain (e.g. `supply.ultra.io`) can be added under the Worker's Settings → Domains & Routes
if the domain is on Cloudflare.

## Changing excluded wallets

Edit the `EXCLUDED` array in `src/worker.js` and redeploy.
