import { generateWithConsensus } from "../../agent/llm/index.js";
/**
 * Covers the criteria that don't have a clean structured data API: team,
 * the problem statement, backers, ecosystem investment/raises, token unlock
 * schedule, airdrop info, narrative alignment, and whitepaper quality.
 *
 * Approach: fetch the project's website and whitepaper (if linked) as raw
 * text, hand it to the LLM, and have it extract only what's actually
 * present — explicitly instructed not to guess at anything not in the text.
 *
 * Known limitation: this only sees what's on the public site/whitepaper.
 * Token unlock schedules in particular are usually better sourced from
 * CryptoRank/DropsTab's dedicated unlock calendars — this module will
 * mark that criterion low-confidence unless the site happens to state it
 * directly. Swap in a dedicated unlock-calendar scraper later if this
 * criterion matters most to you.
 */
const QUALITATIVE_SYSTEM = `You are a web3 investment analyst. You are given raw website/whitepaper text for a project. Extract what you can find for each category below. If something isn't stated in the provided text, say "not found in available sources" — never guess or fill in from general knowledge about the project.

Return ONLY valid JSON, no markdown fences:
{
  "team": "what's said about the team - names, backgrounds, doxxed vs anonymous",
  "problem": "what problem the project claims to solve, in your own words",
  "token_unlock_schedule": "any vesting or unlock schedule info mentioned",
  "airdrop": "any airdrop program mentioned - past, active, or rumored",
  "narrative_alignment": "what current crypto narrative/trend this fits (e.g. restaking, RWA, AI agents, DePIN) and how strong that fit genuinely is - be skeptical of vague narrative claims",
  "whitepaper_assessment": "brief quality assessment - vague marketing language vs substantive technical detail, and whether claims seem verifiable",
  "red_flags": ["array of any concerning signs in the text itself - e.g. unrealistic promises, missing team info, plagiarized-sounding boilerplate"]
}`;
const CRITERIA_META = [
    { key: "team", criterion: "team", label: "Team" },
    { key: "problem", criterion: "problem", label: "The Problem" },
    { key: "token_unlock_schedule", criterion: "token_unlock_schedule", label: "Token Unlock Schedule" },
    { key: "airdrop", criterion: "airdrop", label: "Airdrop" },
    { key: "narrative_alignment", criterion: "narrative_alignment", label: "Narrative Alignment" },
    { key: "whitepaper_assessment", criterion: "whitepaper", label: "Whitepaper" },
];
async function fetchAsText(url) {
    try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (web3-research-agent)" } });
        if (!res.ok)
            return null;
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("pdf")) {
            // PDF whitepapers aren't parsed here — would need a PDF text extraction
            // step. Skipped for now; HTML whitepapers/docs sites work fine.
            return null;
        }
        const html = await res.text();
        return html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 8000); // keep prompt size sane
    }
    catch (err) {
        console.error(`[qualitative] failed to fetch ${url}:`, err);
        return null;
    }
}
function naResults(reason) {
    return CRITERIA_META.map((c) => ({
        criterion: c.criterion,
        label: c.label,
        findings: reason,
        confidence: "low",
    }));
}
export async function analyzeQualitative(profile) {
    const sourceTexts = [];
    for (const url of [profile.website, profile.whitepaperUrl].filter((u) => !!u)) {
        const text = await fetchAsText(url);
        if (text)
            sourceTexts.push(`--- Source: ${url} ---\n${text}`);
    }
    if (sourceTexts.length === 0) {
        return naResults("No website or whitepaper text could be fetched for this project (missing link, PDF whitepaper, or fetch failure).");
    }
    const { primary, results } = await generateWithConsensus(QUALITATIVE_SYSTEM, `Project: ${profile.name} (${profile.symbol ?? "no ticker"})\n\n${sourceTexts.join("\n\n")}`);
    if (!primary) {
        console.error("[qualitative] all providers failed:", results);
        return naResults("Analysis failed — no LLM provider returned a usable result. Check GEMINI_API_KEY/ANTHROPIC_API_KEY.");
    }
    const confidence = sourceTexts.length >= 2 ? "medium" : "low"; // whitepaper+site together is more reliable than site alone
    return CRITERIA_META.map((c) => ({
        criterion: c.criterion,
        label: c.label,
        findings: primary[c.key] ?? "not found in available sources",
        confidence,
    }));
}
