import type { ProjectProfile } from "../types.js";
import { fetchCoinGecko } from "./coingecko.js";

interface CoinGeckoSearchResult {
  coins: Array<{ id: string; name: string; symbol: string; api_symbol: string }>;
}

interface CoinGeckoCoinDetail {
  name: string;
  symbol: string;
  contract_address?: string;
  links: {
    homepage?: string[];
    whitepaper?: string;
    repos_url?: { github?: string[] };
    twitter_screen_name?: string;
  };
}

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
export async function resolveProject(query: string): Promise<ProjectProfile> {
  try {
    const searchData = await fetchCoinGecko<CoinGeckoSearchResult>(
      `/search?query=${encodeURIComponent(query)}`
    );
    const normalizedQuery = query.trim().toLowerCase();
    const top = searchData.coins?.find(
      (coin) => coin.name.toLowerCase() === normalizedQuery || coin.symbol.toLowerCase() === normalizedQuery
    ) ?? searchData.coins?.[0];

    if (!top) {
      console.warn(`[resolver] no CoinGecko match for "${query}" — proceeding with name only`);
      return { query, name: query };
    }

    const detail = await fetchCoinGecko<CoinGeckoCoinDetail>(
      `/coins/${top.id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`
    );

    const homepageCandidates = detail.links?.homepage ?? [];
    const explicitGithubUrls = detail.links?.repos_url?.github ?? [];
    const githubRepo = findGithubRepo([ ...explicitGithubUrls, ...homepageCandidates ]);

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
  } catch (err) {
    console.error(`[resolver] failed to resolve "${query}":`, err);
    return { query, name: query };
  }
}

function extractGithubRepo(url: string): string | undefined {
  const sanitized = url.trim();
  if (!sanitized) return undefined;

  const patterns = [
    /github\.com\/([^/]+)\/([^/?#]+)/i,
    /gitlab\.com\/([^/]+)\/([^/?#]+)/i,
    /gitHub\.com\/([^/]+)\/([^/?#]+)/i,
  ];

  for (const pattern of patterns) {
    const match = sanitized.match(pattern);
    if (match) return `${match[1]}/${match[2]}`;
  }

  return undefined;
}

function findGithubRepo(urls: string[]): string | undefined {
  for (const url of urls) {
    const cleaned = normalizeUrl(url);
    if (!cleaned) continue;

    const repo = extractGithubRepo(cleaned);
    if (repo) return repo;
  }
  return undefined;
}

function normalizeUrl(value: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return url.toString();
  } catch {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }
}
