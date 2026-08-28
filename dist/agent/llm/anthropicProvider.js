import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config.js";
import { parseJsonLoose } from "./provider.js";
export class AnthropicProvider {
    name = "anthropic";
    client;
    constructor() {
        this.client = new Anthropic({ apiKey: config.llm.anthropicApiKey });
    }
    async generateJSON(system, userPrompt, maxTokens = 4000) {
        const response = await this.client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: userPrompt }],
        });
        const textBlock = response.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text")
            return null;
        return parseJsonLoose(textBlock.text);
    }
}
