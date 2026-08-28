import { generateWithConsensus } from "../agent/llm/index.js";
import type { CriterionResult, ModelAgreement, ProjectProfile } from "../types.js";

const SYNTHESIS_SYSTEM = `You are a senior web3 investment analyst writing a final verdict for a colleague, based on research findings already gathered across on-chain, developer, tokenomics, community, and qualitative criteria. Do not invent facts beyond what's given — your job is judgment on the evidence provided, not additional research.

Weigh corroborating evidence across categories more heavily than any single strong or weak point. Low-confidence findings should carry less weight than high-confidence ones. Always name the single biggest risk, even for a project that otherwise looks strong.

Return ONLY valid JSON, no markdown fences:
{
  "overallScore": 0-100,
  "verdict": "2-4 sentence summary a busy investor would actually read",
  "strengths": ["array of the strongest, best-evidenced points"],
  "redFlags": ["array of the biggest concerns - always at least one"]
}`;

export interface SynthesisResult {
  overallScore: number;
  verdict: string;
  strengths: string[];
  redFlags: string[];
  modelAgreement?: ModelAgreement;
}

export async function synthesizeReport(
  profile: ProjectProfile,
  criteria: CriterionResult[]
): Promise<SynthesisResult> {
  const findingsBlock = criteria
    .map((c) => `## ${c.label} (confidence: ${c.confidence})\n${c.findings}`)
    .join("\n\n");

  const { primary, results } = await generateWithConsensus<{
    overallScore: number;
    verdict: string;
    strengths: string[];
    redFlags: string[];
  }>(SYNTHESIS_SYSTEM, `Project: ${profile.name} (${profile.symbol ?? "no ticker"})\n\n${findingsBlock}`);

  if (!primary) {
    return {
      overallScore: 0,
      verdict: "Synthesis failed — no LLM provider returned a usable result. Check GEMINI_API_KEY/ANTHROPIC_API_KEY in .env.",
      strengths: [],
      redFlags: ["Could not generate a verdict for this project."],
    };
  }

  let modelAgreement: ModelAgreement | undefined;
  if (results.length > 1) {
    const scores = results
      .map((r) => r.output?.overallScore)
      .filter((s): s is number => typeof s === "number");
    const spread = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0;
    modelAgreement = {
      providers: results.map((r) => r.provider),
      agreed: spread <= 15,
      note:
        spread > 15
          ? `Models disagreed significantly (score spread: ${spread} points across ${results.map((r) => `${r.provider}=${r.output?.overallScore ?? "n/a"}`).join(", ")}) — treat this report with extra caution and dig deeper yourself before acting on it.`
          : undefined,
    };
  }

  return { ...primary, modelAgreement };
}
