const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Models ordered by capability — 70b first, smaller as fallbacks
const GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "mixtral-8x7b-32768",
    "llama-3.1-8b-instant",
];

export async function getGeminiResponse(
    message: string,
    _phone: string,
    apiKey: string,
    systemInstruction?: string,
    history?: { role: "user" | "model"; parts: { text: string }[] }[]
): Promise<string> {
    if (!apiKey) return "⚠️ Clé IA manquante. Vérifiez vos réglages.";

    const historyMessages = (history || []).map(h => ({
        role: h.role === "model" ? "assistant" : "user" as "assistant" | "user",
        content: h.parts[0]?.text || ""
    })).filter(m => m.content);

    const messages = [
        { role: "system" as const, content: systemInstruction || "Tu es l'assistant commercial de la boutique." },
        ...historyMessages,
        { role: "user" as const, content: message }
    ];

    for (const model of GROQ_MODELS) {
        try {
            console.log(`📡 [AI] Groq/${model}...`);
            const res = await fetch(GROQ_API_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ model, messages, max_tokens: 800, temperature: 0.6 }),
                signal: AbortSignal.timeout(15_000)
            });

            if (!res.ok) {
                const err = await res.text();
                console.warn(`⚠️ [AI] ${model} (${res.status}): ${err.slice(0, 120)}`);
                continue;
            }

            const data = await res.json();
            const text = data.choices?.[0]?.message?.content?.trim();
            if (text) {
                console.log(`✅ [AI] Réponse via ${model}`);
                return text;
            }
        } catch (err: any) {
            console.warn(`⚠️ [AI] ${model} failed: ${err.message?.slice(0, 80)}`);
        }
    }

    return "🤖 Je rencontre une difficulté technique. Réessayez dans un instant.";
}
