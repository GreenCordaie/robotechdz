/**
 * Low-level WhatsApp WAHA Library
 */
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
            signal: AbortSignal.timeout(8_000)
        });

        if (!response.ok) {
            const err = await response.text().catch(() => '');
            return { success: false, error: `HTTP ${response.status}: ${err.slice(0, 100)}` };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}
