import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config.js";
import { parseJsonLoose } from "./provider.js";
const GEMINI_MODEL = config.llm.geminiModel || "gemini-3.6-flash";
export class GeminiProvider {
    name = "gemini";
    client;
    constructor() {
        this.client = new GoogleGenerativeAI(config.llm.geminiApiKey);
    }
    async generateJSON(system, userPrompt, maxTokens = 4000) {
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
        return parseJsonLoose(text);
    }
}
