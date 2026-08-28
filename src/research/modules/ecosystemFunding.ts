import { config } from "../../config.js";
import type { CriterionResult, ProjectProfile } from "../../types.js";

const DUNE_BASE = "https://api.dune.com/api/v1";

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (web3-research-agent)" } });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("pdf")) return null;
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return null;
  }
}

function extractFundingText(raw: string): string {
  const lower = raw.toLowerCase();
  const detectors = [
    /(seed|series [a-z]|pre-seed|strategic round|funding round|token round|grant|raise|raises)/gi,
    /(\$\d+(?:,\d+)*(?:\.\d+)?m|\$\d+(?:,\d+)*(?:\.\d+)?k|\$\d+(?:,\d+)*(?:\.\d+)?\s*(million|billion))/gi,
  ];

  const matches = Array.from(new Set(
    raw
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => detectors.some((re) => re.test(sentence)))
      .slice(0, 5)
      .map((sentence) => sentence.trim())
  ));

  if (matches.length === 0) return "No explicit funding or raise language found in the public sources.";
  return matches.join(" ");
}

function extractBackerText(raw: string): string {
  const patterns = [
    /([A-Z][A-Za-z0-9. &-]+(?: VC| Ventures| Capital| Labs| Guild| Foundation| DAO| Investments))/g,
    /(backed by|backers:|investors:|supported by|led by|raised from)/gi,
  ];
  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => patterns.some((pattern) => pattern.test(sentence)))
    .slice(0, 5);

  if (sentences.length === 0) return "No explicit backer or investor language found in the public sources.";
  return sentences.join(" ");
}

async function tryDuneFunding(profile: ProjectProfile): Promise<{ backers?: string; ecosystemInvestment?: string }> {
  const apiKey = config.dune.apiKey;
  const queryId = config.dune.queryId;

  if (!apiKey || !queryId) {
    return {};
  }

  try {
    const res = await fetch(`${DUNE_BASE}/query/${queryId}/execute`, {
      method: "POST",
      headers: {
        "x-dune-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ params: { project_name: profile.name, symbol: profile.symbol ?? "", coingecko_id: profile.coingeckoId ?? "" } }),
    });

    if (!res.ok) return {};
    const json = (await res.json()) as { execution_id?: string };
    if (!json.execution_id) return {};

    return {
      ecosystemInvestment: `Dune query configured for ecosystem funding (${json.execution_id}). Query results should be reviewed in the Dune dashboard for this project.`,
      backers: `Dune investor/funding query configured for this project (${json.execution_id}). Review the upstream query for backer names and funding rounds.`,
    };
  } catch {
    return {};
  }
}

export async function analyzeEcosystemFunding(profile: ProjectProfile): Promise<CriterionResult[]> {
  const sourceTexts: string[] = [];

  for (const url of [profile.website, profile.whitepaperUrl].filter((u): u is string => !!u)) {
    const text = await fetchText(url);
    if (text) sourceTexts.push(`--- Source: ${url} ---\n${text}`);
  }

  const duneData = await tryDuneFunding(profile);
  const combined = sourceTexts.join("\n\n");

  const backersFinding = duneData.backers ?? (combined ? extractBackerText(combined) : "No explicit backer or investor language found in the public sources.");
  const ecosystemFinding = duneData.ecosystemInvestment ?? (combined ? extractFundingText(combined) : "No explicit ecosystem funding or raise information found in the public sources.");

  return [
    {
      criterion: "backers",
      label: "Backers",
      findings: backersFinding,
      confidence: sourceTexts.length > 0 ? "medium" : "low",
    },
    {
      criterion: "ecosystem_investment",
      label: "Ecosystem Investment",
      findings: ecosystemFinding,
      confidence: sourceTexts.length > 0 ? "medium" : "low",
    },
  ];
}
