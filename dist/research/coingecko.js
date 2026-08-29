import { config } from "../config.js";
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const CACHE_MS = 60_000;
const MAX_RETRIES = 3;
const responseCache = new Map();
let requestChain = Promise.resolve();
export async function fetchCoinGecko(path) {
    const cached = responseCache.get(path);
    if (cached && cached.expiresAt > Date.now())
        return cached.value;
    // Keep requests from several research modules inside one process serialized.
    const request = requestChain.then(() => requestWithRetry(path));
    requestChain = request.then(() => undefined, () => undefined);
    const value = await request;
    responseCache.set(path, { expiresAt: Date.now() + CACHE_MS, value });
    return value;
}
async function requestWithRetry(path) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        const headers = {
            Accept: "application/json",
            "User-Agent": "web3-research-agent/1.0",
        };
        if (config.coingecko.apiKey)
            headers["x-cg-demo-api-key"] = config.coingecko.apiKey;
        const response = await fetch(`${COINGECKO_BASE}${path}`, { headers });
        if (response.ok)
            return (await response.json());
        if (response.status !== 429 || attempt === MAX_RETRIES) {
            throw new Error(`CoinGecko request failed: ${response.status}`);
        }
        const retryAfter = Number(response.headers.get("retry-after"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 1_000 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 8_000)));
    }
    throw new Error("CoinGecko request failed after retries");
}
