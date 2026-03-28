/**
 * Low-level WhatsApp WAHA Library
 */

/**
 * LID → JID mapping table.
 * WhatsApp Web.js (WAHA) sometimes sends internal "LID" identifiers instead
 * of the real @c.us phone-based JID. This table maps known LIDs to their
 * corresponding phone number JID.
 *
 * Format:  "<numeric_lid>@lid" : "<phone_digits>@c.us"
 * Add a row each time a new LID is discovered (e.g. from WAHA logs or the
 * admin support view).
 */
const LID_TO_JID_MAP: Record<string, string> = {
    "127075247759470@lid": "213560900657@c.us",
    // Add further mappings here as they are discovered:
    // "999999999999999@lid": "213XXXXXXXXX@c.us",
};

/**
 * Resolve a WhatsApp sender identifier.
 * - If `id` ends with `@lid` and has a known mapping, returns the real JID.
 * - If `id` ends with `@lid` but is unknown, strips the `@lid` suffix and
 *   returns the raw numeric string (best-effort fallback).
 * - Otherwise returns `id` unchanged.
 */
export function resolveJID(id: string): string {
    if (!id.endsWith("@lid")) return id;
    if (LID_TO_JID_MAP[id]) return LID_TO_JID_MAP[id];
    // Unknown LID: Return as-is so it remains a valid JID for outgoing replies
    return id;
}

export async function sendWhatsAppMessage(
    recipientPhone: string,
    message: string,
    settings: {
        whatsappApiUrl?: string,
        whatsappApiKey?: string,
        whatsappInstanceName?: string
    }
) {
    if (!settings.whatsappApiUrl || !settings.whatsappInstanceName) {
        return { success: false, error: "Settings incomplete" };
    }

    // Normalize phone to international format — default country: Algeria (+213)
    // 0XXXXXXXXX (10 digits)  → 213XXXXXXXXX
    // XXXXXXXXX  (9 digits)   → 213XXXXXXXXX
    // 213XXXXXXXXX+ (11+ digits) → kept as-is (already has country code)
    let chatId: string;
    if (recipientPhone.includes('@')) {
        chatId = recipientPhone;
    } else {
        let digits = recipientPhone.replace(/\D/g, '');
        if (digits.startsWith('0') && digits.length === 10) {
            digits = '213' + digits.slice(1);
        } else if (digits.length === 9) {
            digits = '213' + digits;
        }
        // 11+ digits = already has country code, keep as-is
        chatId = `${digits}@c.us`;
    }

    // host.docker.internal n'est résolvable que depuis Docker → remplacer par localhost
    const apiUrl = (settings.whatsappApiUrl || '').replace('host.docker.internal', 'localhost');
    const url = `${apiUrl}/api/sendText`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.whatsappApiKey) headers['X-Api-Key'] = settings.whatsappApiKey;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                session: settings.whatsappInstanceName,
                chatId,
                text: message,
            }),
            signal: AbortSignal.timeout(30_000) // Increase to 30s for slower environments
        });

        if (!response.ok) {
            const err = await response.text().catch(() => '');
            return { success: false, error: `WhatsApp API Error (${response.status}): ${err.slice(0, 100)}` };
        }

        const result = await response.json().catch(() => ({}));
        return { success: true, id: result.id };
    } catch (error: any) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            return { success: false, error: "Le serveur WhatsApp est trop long à répondre (Timeout 30s)" };
        }
        return { success: false, error: `Erreur de connexion : ${error.message}` };
    }
}
export async function getWhatsAppContact(
    chatId: string,
    settings: {
        whatsappApiUrl?: string,
        whatsappApiKey?: string,
        whatsappInstanceName?: string
    }
) {
    if (!settings.whatsappApiUrl || !settings.whatsappInstanceName) return null;

    const apiUrl = (settings.whatsappApiUrl || '').replace('host.docker.internal', 'localhost');
    const url = `${apiUrl}/api/contacts?contactId=${chatId}&session=${settings.whatsappInstanceName}`;

    const headers: Record<string, string> = {};
    if (settings.whatsappApiKey) headers['X-Api-Key'] = settings.whatsappApiKey;

    try {
        const response = await fetch(url, { headers });
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error("[WAHA] Failed to fetch contact:", error);
        return null;
    }
}

export async function sendWhatsAppSeen(
    chatId: string,
    settings: {
        whatsappApiUrl?: string,
        whatsappApiKey?: string,
        whatsappInstanceName?: string
    }
) {
    if (!settings.whatsappApiUrl || !settings.whatsappInstanceName) return { success: false };

    const apiUrl = (settings.whatsappApiUrl || '').replace('host.docker.internal', 'localhost');
    const url = `${apiUrl}/api/sendSeen`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.whatsappApiKey) headers['X-Api-Key'] = settings.whatsappApiKey;

    try {
        await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                session: settings.whatsappInstanceName,
                chatId,
            })
        });
        return { success: true };
    } catch (error) {
        return { success: false };
    }
}
