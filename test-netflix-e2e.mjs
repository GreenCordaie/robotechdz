/**
 * E2E Test — Netflix Household Resolver
 * Usage: node test-netflix-e2e.mjs [phone] [keyword]
 *
 * Exemples:
 *   node test-netflix-e2e.mjs 213XXXXXXXXX foyer
 *   node test-netflix-e2e.mjs 213XXXXXXXXX "code netflix"
 */

const BASE_URL = process.env.TEST_URL || "http://localhost:1556";
const PHONE = process.argv[2] || "213XXXXXXXXX"; // numéro client avec slot Netflix actif
const KEYWORD = process.argv[3] || "foyer";

// Payload WAHA simulé
const payload = {
    event: "message",
    payload: {
        id: `test-${Date.now()}`,
        from: `${PHONE}@c.us`,
        body: KEYWORD,
        fromMe: false,
        timestamp: Math.floor(Date.now() / 1000),
        type: "chat"
    }
};

console.log("═══════════════════════════════════════════════════");
console.log("  E2E Test — Netflix Auto-Resolver");
console.log("═══════════════════════════════════════════════════");
console.log(`  URL     : ${BASE_URL}/api/webhooks/whatsapp`);
console.log(`  Phone   : ${PHONE}`);
console.log(`  Message : "${KEYWORD}"`);
console.log("═══════════════════════════════════════════════════\n");

try {
    const res = await fetch(`${BASE_URL}/api/webhooks/whatsapp`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.WHATSAPP_WEBHOOK_SECRET || "abc"
        },
        body: JSON.stringify(payload)
    });

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log(`[${res.status}] Réponse webhook:`, JSON.stringify(json, null, 2));

    if (res.status === 401) {
        console.log("\n⚠️  Signature rejetée — essaie avec le header WAHA_HMAC_TOKEN si configuré.");
        console.log("   Ou désactive temporairement la vérification de signature dans webhook-security.ts");
    } else if (res.status === 200) {
        console.log("\n✅ Webhook accepté.");
        console.log("   → Vérifie les logs du serveur Next.js pour voir la résolution Netflix.");
        console.log("   → Le client recevra un message WhatsApp dans 1-2 minutes si un email Netflix est trouvé.");
    }
} catch (err) {
    console.error("❌ Erreur connexion:", err.message);
    console.log("   → Assure-toi que Next.js tourne sur", BASE_URL);
}
