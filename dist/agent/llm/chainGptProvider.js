import { config } from "../../config.js";
import { parseJsonLoose } from "./provider.js";
const CHAIN_GPT_AUDITOR_URL = "https://api.chaingpt.org/chat/stream";
export class ChainGptProvider {
    name = "chaingpt";
    async generateJSON(system, userPrompt) {
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
        if (!response.ok)
            throw new Error(`ChainGPT audit failed: ${response.status}`);
        const text = await response.text();
        const parsedResponse = parseJsonLoose(text);
        const output = parsedResponse?.data?.bot ?? parsedResponse?.bot ?? text;
        return parseJsonLoose(output);
    }
}
