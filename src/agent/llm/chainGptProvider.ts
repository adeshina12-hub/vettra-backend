import { config } from "../../config.js";
import { parseJsonLoose, type LLMProvider } from "./provider.js";

const CHAIN_GPT_AUDITOR_URL = "https://api.chaingpt.org/chat/stream";

export class ChainGptProvider implements LLMProvider {
  readonly name = "chaingpt";

  async generateJSON<T = any>(system: string, userPrompt: string): Promise<T | null> {
    const response = await fetch(CHAIN_GPT_AUDITOR_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.llm.chainGptApiKey}`,
        "Content-Type": "application/json",
        Accept: "text/plain, application/json",
      },
      body: JSON.stringify({
        model: "smart_contract_auditor",
        question: `${system}\n\n${userPrompt}`,
        chatHistory: "off",
      }),
    });

    if (!response.ok) throw new Error(`ChainGPT audit failed: ${response.status}`);
    const text = await response.text();
    const parsedResponse = parseJsonLoose<{ data?: { bot?: string }; bot?: string }>(text);
    const output = parsedResponse?.data?.bot ?? parsedResponse?.bot ?? text;
    return parseJsonLoose<T>(output);
  }
}