export async function sendWhatsAppMessage(customerPhone: string, message: string, settings: { whatsappToken: string, whatsappPhoneId: string }) {
    if (!settings.whatsappToken || !settings.whatsappPhoneId) {
        console.error("WhatsApp configuration missing");
        return { success: false, error: "Configuration WhatsApp manquante" };
    }

    // Format phone number
    // Expected format by Meta: 213XXXXXXXXX (no +, no leading 0)
    let formattedPhone = customerPhone.replace(/\D/g, ''); // Remove non-digits

    if (formattedPhone.startsWith('0')) {
        formattedPhone = '213' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('213')) {
        formattedPhone = '213' + formattedPhone;
    }

    const url = `https://graph.facebook.com/v18.0/${settings.whatsappPhoneId}/messages`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${settings.whatsappToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: formattedPhone,
                type: "text",
                text: {
                    preview_url: false,
                    body: message
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("WhatsApp API error:", data);
            return { success: false, error: data.error?.message || "Erreur API WhatsApp" };
        }

        return { success: true, data };
    } catch (error) {
        console.error("WhatsApp delivery failed:", error);
        return { success: false, error: (error as Error).message };
    }
}
