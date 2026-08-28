import Parser from "rss-parser";
const parser = new Parser();
// Add/remove feeds freely — these are a reasonable starting set.
const FEEDS = [
    { name: "TheBlock", url: "https://www.theblock.co/rss.xml" },
    { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
    { name: "CoinTelegraph", url: "https://cointelegraph.com/rss" },
];
const CATALYST_KEYWORDS = [
    "raises", "funding", "seed round", "hack", "exploit", "mainnet",
    "launches", "partnership", "listing", "acquisition", "airdrop",
];
export async function collectNewsSignals() {
    const signals = [];
    for (const feed of FEEDS) {
        try {
            const parsed = await parser.parseURL(feed.url);
            for (const item of parsed.items.slice(0, 15)) {
                const text = `${item.title ?? ""} ${item.contentSnippet ?? ""}`.toLowerCase();
                const matched = CATALYST_KEYWORDS.find((kw) => text.includes(kw));
                if (!matched)
                    continue;
                signals.push({
                    id: `news:${feed.name}:${item.guid ?? item.link}`,
                    source: "news",
                    subSource: feed.name,
                    title: item.title ?? "Untitled",
                    detail: item.contentSnippet ?? "",
                    url: item.link,
                    metricLabel: "catalyst keyword",
                    metricValue: undefined,
                    observedAt: item.isoDate ?? new Date().toISOString(),
                });
            }
        }
        catch (err) {
            console.error(`[news] failed to fetch feed "${feed.name}":`, err);
        }
    }
    return signals;
}
