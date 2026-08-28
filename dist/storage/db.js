import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
// Uses the service role key (server-side only, never expose this to a
// browser) so this pipeline can write to every table regardless of RLS —
// RLS policies matter once you add per-user data via the dashboard/API,
// not for this background pipeline itself.
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
/**
 * Inserts signals, ignoring ones whose id already exists (dedup), and
 * returns only the genuinely new ones — so the (costly) LLM scoring step
 * only ever sees fresh data.
 */
export async function saveSignals(signals) {
    if (signals.length === 0)
        return [];
    // Supabase upsert with ignoreDuplicates tells us nothing about which
    // rows were actually new, so we check existing ids first, then insert
    // only the difference — two round trips, but keeps the "new vs already
    // seen" distinction the pipeline depends on.
    const ids = signals.map((s) => s.id);
    const { data: existing, error: selectErr } = await supabase
        .from("raw_signals")
        .select("id")
        .in("id", ids);
    if (selectErr) {
        console.error("[storage] failed to check existing signals:", selectErr);
        return [];
    }
    const existingIds = new Set((existing ?? []).map((r) => r.id));
    const newSignals = signals.filter((s) => !existingIds.has(s.id));
    if (newSignals.length === 0)
        return [];
    const { error: insertErr } = await supabase.from("raw_signals").insert(newSignals.map((s) => ({
        id: s.id,
        source: s.source,
        sub_source: s.subSource,
        asset: s.asset ?? null,
        title: s.title,
        detail: s.detail,
        url: s.url ?? null,
        metric_value: s.metricValue ?? null,
        metric_label: s.metricLabel ?? null,
        observed_at: s.observedAt,
    })));
    if (insertErr) {
        console.error("[storage] failed to insert signals:", insertErr);
        return [];
    }
    return newSignals;
}
export async function saveOpportunities(opportunities) {
    if (opportunities.length === 0)
        return;
    const { error } = await supabase.from("opportunities").upsert(opportunities.map((o) => ({
        id: o.id,
        title: o.title,
        asset: o.asset ?? null,
        score: o.score,
        reasoning: o.reasoning,
        supporting_signal_ids: o.supportingSignalIds,
        category: o.category,
        created_at: o.createdAt,
        alerted: false,
    })));
    if (error)
        console.error("[storage] failed to save opportunities:", error);
}
export async function getUnalertedOpportunities(minScore) {
    const { data, error } = await supabase
        .from("opportunities")
        .select("*")
        .eq("alerted", false)
        .gte("score", minScore)
        .order("score", { ascending: false });
    if (error) {
        console.error("[storage] failed to fetch unalerted opportunities:", error);
        return [];
    }
    return (data ?? []).map(rowToOpportunity);
}
export async function markAlerted(id) {
    const { error } = await supabase.from("opportunities").update({ alerted: true }).eq("id", id);
    if (error)
        console.error("[storage] failed to mark opportunity alerted:", error);
}
export async function getRecentOpportunities(limit = 50) {
    const { data, error } = await supabase
        .from("opportunities")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) {
        console.error("[storage] failed to fetch recent opportunities:", error);
        return [];
    }
    return (data ?? []).map(rowToOpportunity);
}
function rowToOpportunity(row) {
    return {
        id: row.id,
        title: row.title,
        asset: row.asset ?? undefined,
        score: row.score,
        reasoning: row.reasoning,
        supportingSignalIds: row.supporting_signal_ids ?? [],
        category: row.category,
        createdAt: row.created_at,
    };
}
/**
 * Returns the average post/mention count for `term` over its last
 * `windowRuns` recorded runs (excluding the current one) — the baseline a
 * new count is compared against to detect a velocity spike. Returns null
 * if there's not enough history yet to judge (avoids false spikes on day one).
 */
export async function getTermBaseline(term, windowRuns = 6) {
    const { data, error } = await supabase
        .from("term_mention_history")
        .select("count")
        .eq("term", term)
        .order("recorded_at", { ascending: false })
        .limit(windowRuns);
    if (error) {
        console.error("[storage] failed to fetch term baseline:", error);
        return null;
    }
    if (!data || data.length < 3)
        return null; // need a few data points before trusting a baseline
    return data.reduce((sum, r) => sum + r.count, 0) / data.length;
}
export async function recordTermMentionCount(term, count) {
    const { error } = await supabase
        .from("term_mention_history")
        .insert({ term, count, recorded_at: new Date().toISOString() });
    if (error)
        console.error("[storage] failed to record term mention count:", error);
    // Pruning old history rows is handled by a scheduled SQL job in Supabase
    // (see supabase/schema.sql) rather than from the app — cheaper than a
    // delete-query on every single pipeline run.
}
// --- Research reports (due-diligence agent) ---
export async function saveReport(report) {
    const { error } = await supabase.from("reports").insert({
        id: report.id,
        query: report.query,
        profile: report.profile,
        criteria: report.criteria,
        overall_score: report.overallScore,
        verdict: report.verdict,
        strengths: report.strengths,
        red_flags: report.redFlags,
        model_agreement: report.modelAgreement ?? null,
        created_at: report.createdAt,
    });
    if (error)
        console.error("[storage] failed to save report:", error);
}
export async function getReport(id) {
    const { data, error } = await supabase.from("reports").select("*").eq("id", id).single();
    if (error || !data)
        return null;
    return rowToReport(data);
}
export async function listReports(limit = 50) {
    const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) {
        console.error("[storage] failed to list reports:", error);
        return [];
    }
    return (data ?? []).map(rowToReport);
}
function rowToReport(row) {
    return {
        id: row.id,
        query: row.query,
        profile: row.profile,
        criteria: row.criteria,
        overallScore: row.overall_score,
        verdict: row.verdict,
        strengths: row.strengths ?? [],
        redFlags: row.red_flags ?? [],
        modelAgreement: row.model_agreement ?? undefined,
        createdAt: row.created_at,
    };
}
