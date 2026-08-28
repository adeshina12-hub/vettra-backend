export function parseJsonLoose(text) {
    try {
        const cleaned = text.replace(/```json|```/g, "").trim();
        return JSON.parse(cleaned);
    }
    catch (err) {
        console.error("[llm] failed to parse JSON output:", err, text.slice(0, 500));
        return null;
    }
}
