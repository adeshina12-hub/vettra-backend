import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { Opportunity, RawSignal } from "../types.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `You are a market-signal analyst for a web3 investor/builder.
You receive a batch of raw signals (on-chain, social, news) and must:

1. Group signals that relate to the same asset/narrative/event.
2. Score each resulting opportunity 0-100 on how actionable it is right now.
   High scores need MULTIPLE corroborating signals (e.g. liquidity spike +
   news catalyst) or one very strong signal from a reliable source category.
   A single noisy price move alone should rarely score above 40.
3. Write a short, concrete reasoning: what happened, why it might matter,
   and the biggest reason it could be wrong (false positives are common —
   name the risk).
4. Categorize as one of: new_narrative, smart_money, social_spike, news_catalyst, other.
5. Ignore signals that are too thin to say anything useful about — don't
   force every signal into an opportunity.

Return ONLY valid JSON matching this shape, nothing else:
{
  "opportunities": [
    {
      "title": "string, under 12 words",
      "asset": "string or null",
      "score": 0-100,
      "reasoning": "2-4 sentences, include the key risk",
      "supportingSignalIds": ["id1", "id2"],
      "category": "new_narrative | smart_money | social_spike | news_catalyst | other"
    }
  ]
}`;

export async function scoreSignals(signals: RawSignal[]): Promise<Opportunity[]> {
  if (signals.length === 0) return [];

  if (!config.anthropicApiKey) {
    console.warn(
      `[agent] ANTHROPIC_API_KEY not set — skipping scoring for ${signals.length} signal(s). ` +
        `Collectors and storage still ran; no opportunities will be generated until a valid key is set.`
    );
    return [];
  }

  const signalBlock = signals
    .map((s) => `[${s.id}] (${s.source}/${s.subSource}) ${s.title} — ${s.detail}`)
    .join("\n");

  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Signals:\n${signalBlock}` }],
    });
  } catch (err) {
    console.error(
      `[agent] Anthropic call failed — skipping scoring for this run (collectors/storage are unaffected). ` +
        `Check ANTHROPIC_API_KEY in .env if this persists:`,
      err
    );
    return [];
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  let parsed: { opportunities: Array<Omit<Opportunity, "id" | "createdAt">> };
  try {
    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("[agent] failed to parse LLM output:", err, textBlock.text);
    return [];
  }

  const now = new Date().toISOString();
  return parsed.opportunities.map((o, i) => ({
    ...o,
    asset: o.asset ?? undefined,
    id: `opp:${now}:${i}`,
    createdAt: now,
  }));
}
