async function simulateTraiteur() {
    const webhookUrl = "https://terrorists-queen-achieve-essex.trycloudflare.com/webhook/flexbox-gateway";

    const payload = {
        eventName: "TRAITEUR_NOTIFY",
        config: {
            tg_token: "8654979494:AAFkggRLkgWcNB3tcsXyzFsbPOXRPdlpm7Q",
            tg_caisse: "8567482274",
            tg_traiteur: "8567482274",
            wa_url: "http://localhost:3001",
            wa_key: "429683C4C977415CAC59562764C7BBA5",
            wa_instance: "robotech"
        },
        data: {
            orderId: 10002,
            orderNumber: "CMD-TRAITEUR-001",
            customerPhone: "213781480740",
            totalAmount: 2000,
            items: [
                {
                    name: "Netflix 1 Mois",
                    quantity: 1,
                    customData: "Ecran 4"
                }
            ]
        }
    };

    console.log("Sending TRAITEUR_NOTIFY to n8n...");
    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const result = await response.text();
        console.log("n8n Response:", response.status, result);
    } catch (err) {
        console.error("Webhook Error:", err);
    }
}

simulateTraiteur();
