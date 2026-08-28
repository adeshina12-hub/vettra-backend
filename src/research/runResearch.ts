import { resolveProject } from "./resolver.js";
import { analyzeOnchainGrowth } from "./modules/onchainGrowth.js";
import { analyzeDevActivity } from "./modules/devActivity.js";
import { analyzeTokenomics } from "./modules/tokenomics.js";
import { analyzeCommunity } from "./modules/community.js";
import { analyzeEcosystemFunding } from "./modules/ecosystemFunding.js";
import { analyzeQualitative } from "./modules/qualitative.js";
import { synthesizeReport } from "./synthesize.js";
import { saveReport } from "../storage/db.js";
import type { ResearchReport } from "../types.js";

export async function runResearch(query: string): Promise<ResearchReport> {
  console.log(`[research] resolving "${query}"...`);
  const profile = await resolveProject(query);
  console.log(`[research] resolved to: ${profile.name} (${profile.coingeckoId ?? "no CoinGecko match"})`);

  console.log("[research] running data modules...");
  const [onchain, dev, tokenomics, community, ecosystemFunding, qualitative] = await Promise.all([
    analyzeOnchainGrowth(profile),
    analyzeDevActivity(profile),
    analyzeTokenomics(profile),
    analyzeCommunity(profile),
    analyzeEcosystemFunding(profile),
    analyzeQualitative(profile),
  ]);

  const filteredQualitative = qualitative.filter(
    (c) => !["backers", "ecosystem_investment"].includes(c.criterion)
  );

  const criteria = [onchain, dev, tokenomics, community, ...ecosystemFunding, ...filteredQualitative];

  console.log("[research] synthesizing verdict...");
  const synthesis = await synthesizeReport(profile, criteria);

  const report: ResearchReport = {
    id: `report:${profile.coingeckoId ?? profile.name.toLowerCase().replace(/\s+/g, "-")}:${Date.now()}`,
    query,
    profile,
    criteria,
    overallScore: synthesis.overallScore,
    verdict: synthesis.verdict,
    strengths: synthesis.strengths,
    redFlags: synthesis.redFlags,
    modelAgreement: synthesis.modelAgreement,
    createdAt: new Date().toISOString(),
  };

  await saveReport(report);
  console.log(`[research] done — score ${report.overallScore}/100`);

  return report;
}
