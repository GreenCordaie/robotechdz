/**
 * Low-level WhatsApp Evolution API Library
 * Reverted to Evolution API as per user preference.
 * Business logic and formatting moved to n8n.
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
    if (!settings.whatsappApiUrl || !settings.whatsappApiKey || !settings.whatsappInstanceName) {
        return { success: false, error: "Settings incomplete" };
    }

    // Clean phone number
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    const remoteJid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

    const url = `${settings.whatsappApiUrl}/message/sendText/${settings.whatsappInstanceName}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': settings.whatsappApiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                number: remoteJid,
                options: {
                    delay: 1200,
                    presence: "composing",
                    linkPreview: false
                },
                textMessage: {
                    text: message
                }
            })
        });

        if (!response.ok) {
            return { success: false, error: "Transport Failure" };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}
