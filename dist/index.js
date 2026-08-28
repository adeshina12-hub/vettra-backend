import cron from "node-cron";
import { collectOnchainSignals, collectTvlSignals } from "./collectors/onchain.js";
import { collectSocialSignals } from "./collectors/social.js";
import { collectNewsSignals } from "./collectors/news.js";
import { scoreSignals } from "./agent/scorer.js";
import { saveSignals, saveOpportunities } from "./storage/db.js";
import { startUnifiedBot } from "./bot/alertBot.js";
import { startDashboard } from "./dashboard/server.js";
// Edit this list to whatever assets/narratives you personally want watched.
const WATCH_TERMS = ["base", "solana", "restaking", "ai agent", "rwa"];
async function runPipeline() {
    console.log(`[pipeline] run started ${new Date().toISOString()}`);
    const [onchain, tvl, social, news] = await Promise.all([
        collectOnchainSignals(WATCH_TERMS),
        collectTvlSignals(),
        collectSocialSignals(WATCH_TERMS),
        collectNewsSignals(),
    ]);
    const allSignals = [...onchain, ...tvl, ...social, ...news];
    const newSignals = await saveSignals(allSignals);
    console.log(`[pipeline] collected ${allSignals.length} signals, ${newSignals.length} new`);
    if (newSignals.length > 0) {
        const opportunities = await scoreSignals(newSignals);
        await saveOpportunities(opportunities);
        console.log(`[pipeline] scored ${opportunities.length} opportunities`);
    }
    console.log("[pipeline] automatic Telegram alerts are disabled; use bot commands for on-demand results");
}
async function main() {
    startDashboard();
    const runOnce = process.argv.includes("--once");
    if (runOnce) {
        await runPipeline();
        process.exit(0);
    }
    startUnifiedBot();
    // Every 15 minutes. Tune to taste — tighter for fast-moving watch terms,
    // looser to save on LLM calls.
    cron.schedule("*/15 * * * *", () => {
        runPipeline().catch((err) => console.error("[pipeline] failed:", err));
    });
    console.log("[agent] running — pipeline every 15 minutes, dashboard live.");
    await runPipeline();
}
main().catch((err) => {
    console.error("[agent] fatal error:", err);
    process.exit(1);
});
