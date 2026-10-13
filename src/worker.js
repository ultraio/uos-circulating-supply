// UOS circulating supply API (Cloudflare Worker, no dependencies).
//
// circulating = ERC-20 totalSupply - sum(balances of EXCLUDED addresses)
//
// All figures are read from Ethereum at a single block, so the result can never
// exceed the 1B ERC-20 supply. The bridge is deliberately NOT excluded: bridged
// UOS circulates on Ultra mainnet.

const TOKEN = "0xD13c7342e1ef687C5ad21b27c2b65D772cAb5C8c";
const DECIMALS = 4;

// Non-circulating addresses. Edit this list to change what is excluded.
const EXCLUDED = [
  { label: "Emission contract", address: "0xD13c7342e1ef687C5ad21b27c2b65D772cAb5C8c" },
  { label: "Team wallet", address: "0xa353fec7d411142e4ffac4dede4109693de1ecf1" }, // founders
  { label: "Team wallet", address: "0x7B5D5aeaAaD07f6B511A4bb50c8E26a62F2cf8b1" },
  { label: "Team wallet", address: "0x2D1f9D2ae3aBA50f83e95Bfb5D6f9fd0d064cDaF" },
  { label: "Team wallet", address: "0x2bD6686b1a70D731019292C156557CC3E0670dF0" },
  { label: "Team wallet", address: "0x91a149bdF5f6dE97A3403859789a65c53022E99A" },
  { label: "Team wallet", address: "0xc9E8a13bC461Bf2fbc25d32D1Ce18E377F5E87Ca" },
];

// Public Ethereum RPCs, tried in order until one succeeds. Each must support
// JSON-RPC batches of 8 eth_calls (eth.llamarpc.com and eth.drpc.org don't).
const RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://rpc.mevblocker.io",
  "https://eth-mainnet.public.blastapi.io",
  "https://eth.blockrazor.xyz",
];

const CACHE_SECONDS = 300;

const SEL_TOTAL_SUPPLY = "0x18160ddd";
const SEL_BALANCE_OF = "0x70a08231";

// Per-isolate cache. `last` is kept indefinitely so an RPC outage serves the
// last good figure instead of an error.
let last = null;
let lastAt = 0;
let inflight = null;

async function rpcBatch(url, calls) {
  const body = calls.map(([method, params], id) => ({ jsonrpc: "2.0", id, method, params }));
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  const out = await res.json();
  if (!Array.isArray(out)) throw new Error(`${url} returned a non-batch response`);
  const byId = new Map(out.map((r) => [r.id, r]));
  return calls.map((_, id) => {
    const r = byId.get(id);
    if (!r || r.error || typeof r.result !== "string") {
      throw new Error(`${url} call ${id} failed: ${JSON.stringify(r?.error ?? r)}`);
    }
    return r.result;
  });
}

function hexToBigInt(hex) {
  if (hex === "0x") throw new Error("empty eth_call result");
  return BigInt(hex);
}

function formatUnits(value) {
  const base = 10n ** BigInt(DECIMALS);
  const whole = value / base;
  const frac = (value % base).toString().padStart(DECIMALS, "0");
  return `${whole}.${frac}`;
}

async function fetchFromRpc(url) {
  const [blockHex] = await rpcBatch(url, [["eth_blockNumber", []]]);
  const call = (data) => ["eth_call", [{ to: TOKEN, data }, blockHex]];
  const results = await rpcBatch(url, [
    call(SEL_TOTAL_SUPPLY),
    ...EXCLUDED.map((w) => call(SEL_BALANCE_OF + w.address.slice(2).toLowerCase().padStart(64, "0"))),
  ]);

  const total = hexToBigInt(results[0]);
  const balances = results.slice(1).map(hexToBigInt);
  const excludedSum = balances.reduce((a, b) => a + b, 0n);
  if (total === 0n || excludedSum > total) throw new Error(`${url} returned implausible values`);

  return {
    token: TOKEN,
    chain: "ethereum",
    block: Number(BigInt(blockHex)),
    updated_at: new Date().toISOString(),
    total_supply: formatUnits(total),
    non_circulating_supply: formatUnits(excludedSum),
    circulating_supply: formatUnits(total - excludedSum),
    excluded: EXCLUDED.map((w, i) => ({ label: w.label, address: w.address, balance: formatUnits(balances[i]) })),
  };
}

async function refresh() {
  const errors = [];
  for (const url of RPCS) {
    try {
      return await fetchFromRpc(url);
    } catch (e) {
      errors.push(String(e?.message ?? e));
    }
  }
  throw new Error(errors.join("; "));
}

async function getSupply() {
  if (last && Date.now() - lastAt < CACHE_SECONDS * 1000) return { data: last, stale: false };
  try {
    inflight ??= refresh().finally(() => (inflight = null));
    last = await inflight;
    lastAt = Date.now();
    return { data: last, stale: false };
  } catch (e) {
    console.error("supply refresh failed:", e);
    if (last) return { data: last, stale: true };
    throw e;
  }
}

const COMMON_HEADERS = {
  "access-control-allow-origin": "*",
  "cache-control": `public, max-age=${CACHE_SECONDS}`,
};

function text(body, status = 200) {
  return new Response(body, { status, headers: { ...COMMON_HEADERS, "content-type": "text/plain; charset=utf-8" } });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...COMMON_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") return text("Method not allowed", 405);
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

    const routes = {
      "/circulating-supply": (d) => text(d.circulating_supply),
      "/total-supply": (d) => text(d.total_supply),
      "/breakdown": (d, stale) => json({ ...d, stale }),
      "/": (d, stale) => json({ ...d, stale }),
    };
    const route = routes[path];
    if (!route) return text("Not found. Try /circulating-supply, /total-supply or /breakdown", 404);

    try {
      const { data, stale } = await getSupply();
      return route(data, stale);
    } catch {
      return text("Supply data temporarily unavailable", 503);
    }
  },
};
