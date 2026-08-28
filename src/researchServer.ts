import express from "express";
import { runResearch } from "./research/runResearch.js";
import { runAudit } from "./securityAudit.js";

/**
 * Standalone server for the research pipeline. Kept separate from the
 * Next.js app deliberately — LLM-driven multi-step research can take
 * 10-30+ seconds, which doesn't fit Next.js API routes' serverless
 * execution model. This process runs continuously; Next.js's
 * /api/research route just proxies to it.
 */

const app = express();
app.use(express.json());

app.post("/research", async (req, res) => {
  const { query } = req.body ?? {};
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Missing 'query' string in request body" });
    return;
  }

  try {
    const report = await runResearch(query);
    res.json(report);
  } catch (err) {
    console.error("[research-server] research run failed:", err);
    res.status(500).json({ error: "Research run failed", detail: String(err) });
  }
});

app.post("/audit", async (req, res) => {
  const { source } = req.body ?? {};
  if (!source || typeof source !== "string") {
    res.status(400).json({ error: "Missing 'source' string in request body" });
    return;
  }

  try {
    res.json(await runAudit(source));
  } catch (err) {
    console.error("[research-server] audit failed:", err);
    res.status(500).json({ error: "Security audit failed", detail: String(err) });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = Number(process.env.PORT ?? process.env.RESEARCH_SERVER_PORT ?? 5001);
app.listen(PORT, () => {
  console.log(`[research-server] listening on http://localhost:${PORT}`);
});
