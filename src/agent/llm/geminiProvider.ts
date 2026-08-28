import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config.js";
import { parseJsonLoose, type LLMProvider } from "./provider.js";

const GEMINI_MODEL = config.llm.geminiModel || "gemini-3.6-flash";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private client: GoogleGenerativeAI;

  constructor() {
    this.client = new GoogleGenerativeAI(config.llm.geminiApiKey);
  }

  async generateJSON<T = any>(system: string, userPrompt: string, maxTokens = 4000): Promise<T | null> {
    const model = this.client.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: system,
      generationConfig: {
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(userPrompt);
    const text = result.response.text();
    return parseJsonLoose<T>(text);
  }
}
