/**
 * WhatsApp Evolution API Library
 * Reverted to Evolution API as per user preference.
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
        console.error("❌ Evolution API Credentials Missing");
        return { success: false, error: "Settings incomplete" };
    }

    // Clean phone number
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    const remoteJid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

    const url = `${settings.whatsappApiUrl}/message/sendText/${settings.whatsappInstanceName}`;

    try {
        console.log(`📤 [EVOLUTION-SEND] To: ${remoteJid}`);

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

        const data = await response.json();

        if (!response.ok) {
            console.error("❌ EVOLUTION API ERROR:", JSON.stringify(data));
            return { success: false, error: data.message || "Unknown Evolution Error" };
        }

        console.log(`✅ [SENT-EVOLUTION] Status: ${data.status}`);
        return { success: true, data };
    } catch (error) {
        console.error("Critical Transport Failure:", (error as Error).message);
        return { success: false, error: (error as Error).message };
    }
}
