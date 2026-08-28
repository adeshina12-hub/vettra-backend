const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
/**
 * Resolves a free-text query (name, ticker, or partial match) into a full
 * profile every research module can use. CoinGecko's free /search + /coins
 * endpoints are keyless and cover the vast majority of listed projects —
 * this is the single most useful free resolution source available.
 *
 * If nothing matches, returns a bare profile with just the query as name —
 * downstream modules degrade gracefully (they report "no data found"
 * rather than throwing) rather than the whole research run failing.
 */
export async function resolveProject(query) {
    try {
        const searchRes = await fetch(`${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`);
        if (!searchRes.ok)
            throw new Error(`search failed: ${searchRes.status}`);
        const searchData = (await searchRes.json());
        const top = searchData.coins?.[0];
        if (!top) {
            console.warn(`[resolver] no CoinGecko match for "${query}" — proceeding with name only`);
            return { query, name: query };
        }
        const detailRes = await fetch(`${COINGECKO_BASE}/coins/${top.id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`);
        if (!detailRes.ok)
            throw new Error(`coin detail failed: ${detailRes.status}`);
        const detail = (await detailRes.json());
        const homepageCandidates = detail.links?.homepage ?? [];
        const explicitGithubUrls = detail.links?.repos_url?.github ?? [];
        const githubRepo = findGithubRepo([...explicitGithubUrls, ...homepageCandidates]);
        return {
            query,
            name: detail.name ?? top.name,
            symbol: detail.symbol ?? top.symbol,
            coingeckoId: top.id,
            contractAddress: detail.contract_address,
            website: homepageCandidates.find((h) => h && h.length > 0),
            whitepaperUrl: detail.links?.whitepaper || undefined,
            githubRepo,
            twitterHandle: detail.links?.twitter_screen_name || undefined,
        };
    }
    catch (err) {
        console.error(`[resolver] failed to resolve "${query}":`, err);
        return { query, name: query };
    }
}
function extractGithubRepo(url) {
    const sanitized = url.trim();
    if (!sanitized)
        return undefined;
    const patterns = [
        /github\.com\/([^/]+)\/([^/?#]+)/i,
        /gitlab\.com\/([^/]+)\/([^/?#]+)/i,
        /gitHub\.com\/([^/]+)\/([^/?#]+)/i,
    ];
    for (const pattern of patterns) {
        const match = sanitized.match(pattern);
        if (match)
            return `${match[1]}/${match[2]}`;
    }
    return undefined;
}
function findGithubRepo(urls) {
    for (const url of urls) {
        const cleaned = normalizeUrl(url);
        if (!cleaned)
            continue;
        const repo = extractGithubRepo(cleaned);
        if (repo)
            return repo;
    }
    return undefined;
}
function normalizeUrl(value) {
    if (!value)
        return "";
    const trimmed = value.trim();
    if (!trimmed)
        return "";
    try {
        const url = new URL(trimmed);
        return url.toString();
    }
    catch {
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return trimmed;
        }
        return `https://${trimmed}`;
    }
}
