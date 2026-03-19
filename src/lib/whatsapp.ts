export async function sendWhatsAppMessage(
    customerPhone: string,
    message: string,
    settings: {
        whatsappApiUrl: string,
        whatsappApiKey?: string,
        whatsappInstanceName?: string
    }
) {
    if (!settings.whatsappApiUrl) {
        console.error("WhatsApp configuration missing");
        return { success: false, error: "Configuration API WhatsApp manquante" };
    }

    // Format phone number (Algeria: 213XXXXXXXXX)
    let formattedPhone = customerPhone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '213' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('213')) {
        formattedPhone = '213' + formattedPhone;
    }

    // Professional Delay (Prevent Ban)
    const delay = Math.floor(Math.random() * 2000) + 2000; // 2s to 4s
    await new Promise(resolve => setTimeout(resolve, delay));

    // Evolution API / Local Service logic
    let apiUrl = settings.whatsappApiUrl.replace(/\/$/, '');

    // Windows/Docker networking fix: replace localhost with 127.0.0.1
    if (apiUrl.includes('localhost')) {
        apiUrl = apiUrl.replace('localhost', '127.0.0.1');
    }

    const url = `${apiUrl}/message/sendText/${settings.whatsappInstanceName}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': settings.whatsappApiKey || 'abc',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                number: formattedPhone,
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
            const errData = await response.json().catch(() => ({}));
            console.error("WhatsApp API error:", errData);
            return { success: false, error: "Erreur service WhatsApp local" };
        }

        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        console.error("WhatsApp delivery failed:", error);
        return { success: false, error: (error as Error).message };
    }
}
