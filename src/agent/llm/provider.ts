/**
 * Common interface every LLM provider implements, so the rest of the app
 * (report synthesis, per-criterion analysis, etc.) never needs to know
 * whether it's talking to Claude, Gemini, or something added later.
 */
export interface LLMProvider {
  readonly name: string;
  generateJSON<T = any>(system: string, userPrompt: string, maxTokens?: number): Promise<T | null>;
}

export function parseJsonLoose<T = any>(text: string): T | null {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.error("[llm] failed to parse JSON output:", err, text.slice(0, 500));
    return null;
  }
}
