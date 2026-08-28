import { config } from "../config.js";
const asNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
};
export async function collectSmartMoneySignals() {
    if (!config.nansen.apiKey)
        return [];
    const signals = [];
    try {
        const netflowRes = await fetch("https://api.nansen.ai/api/v1/smart-money/netflow", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: config.nansen.apiKey,
            },
            body: JSON.stringify({
                chains: ["all"],
                pagination: { page: 1, per_page: 10 },
                order_by: [{ field: "net_flow_7d_usd", direction: "DESC" }],
            }),
        });
        if (netflowRes.ok) {
            const payload = (await netflowRes.json());
            const rows = Array.isArray(payload.data)
                ? payload.data
                : Array.isArray(payload.rows)
                    ? payload.rows
                    : Array.isArray(payload.result)
                        ? payload.result
                        : [];
            for (const row of rows) {
                const chain = row.chain ?? row.blockchain ?? "unknown";
                const symbol = row.token_symbol ?? row.symbol ?? row.token_name ?? row.name ?? "TOKEN";
                const netFlow7d = asNumber(row.net_flow_7d_usd);
                if (typeof netFlow7d !== "number" || Math.abs(netFlow7d) < 250_000)
                    continue;
                const direction = netFlow7d >= 0 ? "accumulating" : "distributing";
                const priceUsd = asNumber(row.usd_price ?? row.price_usd ?? row.price);
                const formattedPrice = typeof priceUsd === "number" ? `$${priceUsd.toLocaleString()}` : "n/a";
                signals.push({
                    id: `onchain:nansen-smartmoney-netflow:${chain}:${symbol}`,
                    source: "onchain",
                    subSource: "nansen-smart-money-netflow",
                    asset: symbol,
                    title: `Smart money is ${direction} ${symbol} on ${chain}`,
                    detail: `Nansen smart-money netflow: ${netFlow7d >= 0 ? "+" : "-"}$${Math.abs(netFlow7d).toLocaleString()} USD over 7d. Approx. price: ${formattedPrice}.`,
                    metricValue: Math.abs(netFlow7d),
                    metricLabel: "7d smart-money netflow USD",
                    observedAt: new Date().toISOString(),
                });
            }
        }
        else {
            const text = await netflowRes.text();
            console.error("[onchain] Nansen smart-money netflows request failed:", netflowRes.status, text.slice(0, 400));
        }
        const holdingsRes = await fetch("https://api.nansen.ai/api/v1/smart-money/holdings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: config.nansen.apiKey,
            },
            body: JSON.stringify({
                chains: ["all"],
                filters: {
                    include_smart_money_labels: ["Fund", "Smart Trader"],
                    value_usd: { min: 100000, max: 100000000 },
                },
                pagination: { page: 1, per_page: 10 },
                order_by: [{ field: "value_usd", direction: "DESC" }],
            }),
        });
        if (holdingsRes.ok) {
            const payload = (await holdingsRes.json());
            for (const row of payload.data ?? []) {
                const chain = row.chain ?? row.blockchain ?? "unknown";
                const symbol = row.token_symbol ?? row.symbol ?? row.token_name ?? row.name ?? "TOKEN";
                const valueUsd = asNumber(row.value_usd);
                const holderCount = asNumber(row.holders_count);
                const share = asNumber(row.share_of_holdings_percent);
                if (typeof valueUsd !== "number" || typeof holderCount !== "number" || typeof share !== "number")
                    continue;
                if (valueUsd < 5_000_000 || holderCount < 3 || share < 0.01)
                    continue;
                signals.push({
                    id: `onchain:nansen-smartmoney-holdings:${chain}:${symbol}`,
                    source: "onchain",
                    subSource: "nansen-smart-money-holdings",
                    asset: symbol,
                    title: `Smart-money wallets are concentrated in ${symbol}`,
                    detail: `Smart-money holdings for ${symbol} on ${chain}: $${valueUsd.toLocaleString()} in smart-money wallets across ${holderCount} holders, representing ${share.toFixed(3)}% of smart-money holdings.`,
                    metricValue: valueUsd,
                    metricLabel: "smart-money holdings USD",
                    observedAt: new Date().toISOString(),
                });
            }
        }
        else {
            const text = await holdingsRes.text();
            console.error("[onchain] Nansen smart-money holdings request failed:", holdingsRes.status, text.slice(0, 400));
        }
        return signals;
    }
    catch (err) {
        console.error("[onchain] failed to fetch Nansen smart-money signals:", err);
        return [];
    }
}
export async function collectOnchainSignals(watchTerms) {
    const signals = [];
    signals.push(...(await collectSmartMoneySignals()));
    for (const term of watchTerms) {
        try {
            const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(term)}`);
            if (!res.ok)
                continue;
            const data = (await res.json());
            for (const pair of (data.pairs ?? []).slice(0, 5)) {
                const liquidityUsd = pair.liquidity?.usd ?? 0;
                const change24h = pair.priceChange?.h24;
                const change1h = pair.priceChange?.h1;
                // Only surface pairs with meaningful liquidity, a real 24h figure,
                // and a real price move — filters out illiquid/incomplete pairs
                // before they ever reach the LLM.
                if (typeof change24h !== "number" || liquidityUsd < 20_000 || Math.abs(change24h) < 15)
                    continue;
                signals.push({
                    id: `onchain:dexscreener:${pair.baseToken.address}`,
                    source: "onchain",
                    subSource: "dexscreener",
                    asset: pair.baseToken.symbol,
                    title: `${pair.baseToken.symbol} moved ${change24h.toFixed(1)}% in 24h`,
                    detail: `Chain: ${pair.chainId}. 24h volume: $${(pair.volume?.h24 ?? 0).toLocaleString()}. Liquidity: $${liquidityUsd.toLocaleString()}. 1h change: ${typeof change1h === "number" ? change1h.toFixed(1) : "n/a"}%.`,
                    url: pair.url,
                    metricValue: change24h,
                    metricLabel: "24h price change %",
                    observedAt: new Date().toISOString(),
                });
            }
        }
        catch (err) {
            console.error(`[onchain] failed to fetch signals for "${term}":`, err);
        }
    }
    return signals;
}
/**
 * Protocol-level TVL spikes from DeFiLlama — good early signal for
 * emerging narratives (a protocol's TVL growing fast before its token
 * is widely discussed).
 */
export async function collectTvlSignals() {
    const signals = [];
    try {
        const res = await fetch("https://api.llama.fi/protocols");
        if (!res.ok)
            return signals;
        const protocols = (await res.json());
        for (const p of protocols) {
            if (p.tvl < 1_000_000)
                continue; // skip micro/noise protocols
            if (p.change_1d > 20) {
                signals.push({
                    id: `onchain:defillama:${p.name}`,
                    source: "onchain",
                    subSource: "defillama",
                    asset: p.symbol,
                    title: `${p.name} TVL up ${p.change_1d.toFixed(1)}% in 24h`,
                    detail: `Current TVL: $${p.tvl.toLocaleString()}. 7d change: ${p.change_7d?.toFixed(1)}%.`,
                    url: p.url,
                    metricValue: p.change_1d,
                    metricLabel: "24h TVL change %",
                    observedAt: new Date().toISOString(),
                });
            }
        }
    }
    catch (err) {
        console.error("[onchain] failed to fetch TVL signals:", err);
    }
    return signals;
}
