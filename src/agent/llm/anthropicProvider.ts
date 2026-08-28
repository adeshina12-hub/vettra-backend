import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config.js";
import { parseJsonLoose, type LLMProvider } from "./provider.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: config.llm.anthropicApiKey });
  }

  async generateJSON<T = any>(system: string, userPrompt: string, maxTokens = 4000): Promise<T | null> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    return parseJsonLoose<T>(textBlock.text);
  }
}
