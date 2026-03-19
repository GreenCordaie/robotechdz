import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * ULTRA-ROBUST GEMINI PROVIDER
 * Designed to bypass regional 404/429 blocks by cycling through model strings and API versions.
 */
export async function getGeminiResponse(
    message: string,
    customerPhone: string,
    apiKey: string,
    systemInstruction?: string
) {
    if (!apiKey) return "⚠️ Clé IA manquante. Vérifiez vos réglages.";

    // Combinations of models and versions that known to work for different regions/key types
    const trials = [
        { m: "gemini-1.5-flash", v: "v1" },
        { m: "gemini-1.5-pro", v: "v1" },
        { m: "gemini-1.5-flash-latest", v: "v1" },
        { m: "gemini-2.0-flash", v: "v1" },
        { m: "gemini-2.0-flash-exp", v: "v1beta" }
    ];

    const genAI = new GoogleGenerativeAI(apiKey.trim());

    for (const trial of trials) {
        try {
            console.log(`📡 [AI-HANDSHAKE] Model: ${trial.m} | Version: ${trial.v}`);

            // Force specific version via request options
            const model = genAI.getGenerativeModel(
                { model: trial.m },
                { apiVersion: trial.v as any }
            );

            const sys = systemInstruction || "Tu es l'assistant de FLEXBOX DIRECT.";

            const result = await model.generateContent(`[SYS]\n${sys}\n\n[USER]\n${message}`);

            const response = await result.response;
            const text = response.text();

            if (text) {
                console.log(`✅ [AI-READY] Resolved via ${trial.m}`);
                return text;
            }
        } catch (err: any) {
            const msg = err.message || "Unknown error";
            console.warn(`⚠️ [AI-SKIP] ${trial.m} (${trial.v}) failed: ${msg.substring(0, 100)}`);

            // If it's a structural error, keep trying. If it's a fatal key error, maybe stop?
            // For now, we cycle everything.
        }
    }

    return "🤖 Je rencontre une difficulté technique avec l'IA. Tapez '1' pour votre solde, ou réessayez dans 1 minute.";
}
