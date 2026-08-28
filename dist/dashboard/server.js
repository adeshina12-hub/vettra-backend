import express from "express";
import { config } from "../config.js";
import { getRecentOpportunities } from "../storage/db.js";
/**
 * Minimal read-only API for the dashboard. Ships as JSON for now —
 * point a React frontend at GET /api/opportunities, or open
 * http://localhost:PORT directly for the bare-bones HTML view below.
 * This is intentionally single-user (no auth) — add auth here first
 * when you're ready to open this to your audience.
 */
export function startDashboard() {
    const app = express();
    app.get("/api/opportunities", async (_req, res) => {
        res.json(await getRecentOpportunities(100));
    });
    app.get("/", async (_req, res) => {
        const opportunities = await getRecentOpportunities(50);
        res.send(renderHtml(opportunities));
    });
    app.listen(config.dashboardPort, () => {
        console.log(`[dashboard] running at http://localhost:${config.dashboardPort}`);
    });
}
function renderHtml(opportunities) {
    const rows = opportunities
        .map((o) => `
      <tr>
        <td>${o.score}</td>
        <td>${o.asset ?? "-"}</td>
        <td>${o.title}</td>
        <td>${o.category}</td>
        <td>${new Date(o.createdAt).toLocaleString()}</td>
      </tr>`)
        .join("");
    return `<!DOCTYPE html>
<html><head><title>Signals</title>
<style>
body{font-family:system-ui;margin:2rem;background:#0b0d10;color:#e6e6e6}
table{width:100%;border-collapse:collapse} td,th{padding:8px;border-bottom:1px solid #2a2d33;text-align:left}
</style></head>
<body>
<h1>Opportunities</h1>
<table><thead><tr><th>Score</th><th>Asset</th><th>Title</th><th>Category</th><th>When</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
}
