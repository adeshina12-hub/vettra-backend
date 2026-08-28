import { config } from "../config.js";
import { getTermBaseline, recordTermMentionCount } from "../storage/db.js";
/**
 * Social collector backed by the Sorsa API (https://docs.sorsa.io) —
 * X/Twitter data, no OAuth, 100 free requests to start.
 *
 * Note: LunarCrush was tried first but its free "Discover" tier does not
 * include API/social data access at all (topic endpoints return 402
 * without a paid Individual+ plan) — Sorsa is the source that actually
 * has a usable free trial for this.
 *
 * Two signal types:
 * 1. Mention velocity spikes — a term suddenly getting talked about far
 *    more than its recent baseline, often the earliest public signal.
 *    Needs a few pipeline runs of history before it can judge a spike.
 * 2. Standout individual tweets — enriched with the author's Sorsa Score
 *    (crypto-specific influence rating) so the agent core can weigh
 *    "a known crypto VC posted this" differently from a random account.
 */
const SORSA_BASE = "https://api.sorsa.io/v3";
const RECENT_WINDOW_HOURS = 12;
const SPIKE_MULTIPLIER = 2; // current count must exceed baseline * this to count as a spike
const SPIKE_MIN_ABSOLUTE = 3; // ...and clear this floor, so 1->3 mentions doesn't "spike"
async function sorsaPost(path, body) {
    const res = await fetch(`${SORSA_BASE}${path}`, {
        method: "POST",
        headers: { ApiKey: config.social.sorsaApiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok)
        throw new Error(`Sorsa POST ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
}
async function sorsaGet(path, params) {
    const url = new URL(`${SORSA_BASE}${path}`);
    for (const [k, v] of Object.entries(params))
        url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { ApiKey: config.social.sorsaApiKey } });
    if (!res.ok)
        throw new Error(`Sorsa GET ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
}
function engagementScore(t) {
    return t.likes_count + t.retweet_count * 2 + t.quote_count * 3 + t.reply_count;
}
function isRecent(t, hours) {
    const ageMs = Date.now() - new Date(t.created_at).getTime();
    return ageMs <= hours * 60 * 60 * 1000;
}
// Cache Sorsa Score lookups within a single collector run so multiple
// standout tweets from the same author don't each trigger a fresh call.
const scoreCache = new Map();
async function getScoreCached(username) {
    if (scoreCache.has(username))
        return scoreCache.get(username);
    try {
        const data = await sorsaGet("/score", { username });
        scoreCache.set(username, data.score ?? null);
        return data.score ?? null;
    }
    catch {
        scoreCache.set(username, null);
        return null;
    }
}
export async function collectSocialSignals(watchTerms) {
    if (!config.social.sorsaApiKey) {
        return [];
    }
    const signals = [];
    for (const term of watchTerms) {
        try {
            const data = await sorsaPost("/search-tweets", { query: term, order: "popular" });
            const tweets = data.tweets ?? [];
            const recent = tweets.filter((t) => isRecent(t, RECENT_WINDOW_HOURS));
            // --- Signal type 1: mention velocity spike ---
            const baseline = await getTermBaseline(term);
            await recordTermMentionCount(term, recent.length);
            if (baseline !== null && recent.length >= SPIKE_MIN_ABSOLUTE && recent.length > baseline * SPIKE_MULTIPLIER) {
                signals.push({
                    id: `social:sorsa:spike:${term}:${new Date().toISOString().slice(0, 13)}`,
                    source: "social",
                    subSource: "sorsa-velocity",
                    asset: term,
                    title: `"${term}" mention spike: ${recent.length} vs baseline ~${Math.round(baseline)}`,
                    detail: `Mentions of "${term}" in the last ${RECENT_WINDOW_HOURS}h (${recent.length}) are ${(recent.length / baseline).toFixed(1)}x the recent baseline (${Math.round(baseline)}). Often an early signal ahead of price action, but can also be a coordinated pump — check who's driving it.`,
                    metricValue: recent.length,
                    metricLabel: "mentions vs baseline multiple",
                    observedAt: new Date().toISOString(),
                });
            }
            // --- Signal type 2: standout individual tweets, weighted by author credibility ---
            const topTweets = [...recent].sort((a, b) => engagementScore(b) - engagementScore(a)).slice(0, 3);
            for (const t of topTweets) {
                if (engagementScore(t) < 50)
                    continue; // filter out low-engagement noise
                const score = await getScoreCached(t.user.username);
                const credibilityNote = score !== null
                    ? `Sorsa crypto-influence score: ${score.toFixed(2)}.`
                    : "No crypto-influence data available for this account.";
                signals.push({
                    id: `social:sorsa:tweet:${t.id}`,
                    source: "social",
                    subSource: "sorsa-tweet",
                    asset: term,
                    title: `@${t.user.username}: ${t.full_text.slice(0, 80)}${t.full_text.length > 80 ? "…" : ""}`,
                    detail: `${t.full_text}\n\n${t.likes_count} likes, ${t.retweet_count} retweets, ${t.view_count} views. Author has ${t.user.followers_count.toLocaleString()} followers${t.user.verified ? " (verified)" : ""}. ${credibilityNote}`,
                    url: `https://x.com/${t.user.username}/status/${t.id}`,
                    metricValue: engagementScore(t),
                    metricLabel: "engagement score",
                    observedAt: t.created_at,
                });
            }
        }
        catch (err) {
            console.error(`[social] failed to collect signals for "${term}":`, err);
        }
    }
    return signals;
}
