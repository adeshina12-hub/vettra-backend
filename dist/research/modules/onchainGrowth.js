import { config } from "../../config.js";
let protocolsCache = null;
let cacheAt = 0;
const CACHE_MS = 10 * 60 * 1000;
async function getProtocols() {
    if (protocolsCache && Date.now() - cacheAt < CACHE_MS)
        return protocolsCache;
    const res = await fetch("https://api.llama.fi/protocols");
    if (!res.ok)
        throw new Error(`DeFiLlama protocols fetch failed: ${res.status}`);
    protocolsCache = (await res.json());
    cacheAt = Date.now();
    return protocolsCache;
}
function asNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
}
async function tryNansenSmartMoney(profile) {
    if (!config.nansen.apiKey)
        return null;
    try {
        const tokenSymbol = profile.symbol?.trim();
        if (!tokenSymbol)
            return null;
        const res = await fetch("https://api.nansen.ai/api/v1/smart-money/netflow", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: config.nansen.apiKey,
            },
            body: JSON.stringify({
                chains: ["all"],
                filters: {
                    token_symbol: [tokenSymbol.toUpperCase()],
                },
                pagination: { page: 1, per_page: 5 },
                order_by: [{ field: "net_flow_7d_usd", direction: "DESC" }],
            }),
        });
        if (!res.ok) {
            console.warn("[onchain-growth] Nansen smart-money netflow skipped:", res.status);
            return null;
        }
        const payload = (await res.json());
        const rows = payload.data ?? [];
        const match = rows.find((row) => {
            const rowSymbol = (row.token_symbol ?? row.token_name ?? "").toString().toLowerCase();
            const projectName = profile.name.toLowerCase();
            return rowSymbol === tokenSymbol.toLowerCase() || projectName.includes(rowSymbol) || rowSymbol.includes(projectName);
        });
        if (!match)
            return null;
        const netFlow7d = asNumber(match.net_flow_7d_usd);
        const chain = match.chain ?? "all";
        const symbol = match.token_symbol ?? tokenSymbol;
        if (typeof netFlow7d !== "number")
            return null;
        const direction = netFlow7d >= 0 ? "accumulating" : "distributing";
        const magnitude = Math.abs(netFlow7d);
        return {
            criterion: "onchain_growth",
            label: "On-chain Growth",
            findings: `Smart-money is ${direction} ${symbol} on ${chain}: ${netFlow7d >= 0 ? "+" : "-"}$${magnitude.toLocaleString()} USD over 7d. This is a strong signal that capital is rotating into or out of the asset at the wallet level.`,
            data: {
                source: "nansen-smart-money",
                chain,
                tokenSymbol: symbol,
                netFlow7d,
                netFlow24h: asNumber(match.net_flow_24h_usd),
                netFlow1h: asNumber(match.net_flow_1h_usd),
                marketCapUsd: asNumber(match.market_cap_usd),
            },
            confidence: "medium",
        };
    }
    catch (err) {
        console.warn("[onchain-growth] Nansen smart-money lookup failed:", err);
        return null;
    }
}
export async function analyzeOnchainGrowth(profile) {
    try {
        const nansenResult = await tryNansenSmartMoney(profile);
        if (nansenResult)
            return nansenResult;
        const protocols = await getProtocols();
        const match = protocols.find((p) => (profile.coingeckoId && p.gecko_id === profile.coingeckoId) ||
            p.name.toLowerCase() === profile.name.toLowerCase());
        if (!match) {
            return {
                criterion: "onchain_growth",
                label: "On-chain Growth",
                findings: "No matching DeFiLlama protocol or Nansen smart-money token signal was found. This is expected for non-DeFi projects or tokens without a tracked TVL app — not necessarily a red flag.",
                confidence: "low",
            };
        }
        return {
            criterion: "onchain_growth",
            label: "On-chain Growth",
            findings: `TVL: $${match.tvl.toLocaleString()}. 24h change: ${fmtPct(match.change_1d)}. 7d change: ${fmtPct(match.change_7d)}. 30d change: ${fmtPct(match.change_1m)}.`,
            data: { source: "defillama", tvl: match.tvl, change1d: match.change_1d, change7d: match.change_7d, change1m: match.change_1m },
            confidence: "high",
        };
    }
    catch (err) {
        console.error("[onchain-growth] failed:", err);
        return {
            criterion: "onchain_growth",
            label: "On-chain Growth",
            findings: "Failed to fetch on-chain growth data.",
            confidence: "low",
        };
    }
}
function fmtPct(n) {
    return typeof n === "number" ? `${n.toFixed(1)}%` : "n/a";
}
