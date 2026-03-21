const fs = require('fs');

async function testDelivery() {
    const payload = {
        eventName: 'CUSTOMER_DELIVERY',
        config: {
            wa_url: "http://host.docker.internal:3001",
            wa_key: "default_key_placeholder", // The workflow uses $json.body.config.wa_key
            wa_instance: "default"
        },
        data: {
            orderId: 999,
            orderNumber: "#TEST-FINAL",
            customerPhone: "0781480740", // User number from request
            deliveryMethod: "whatsapp",
            items: [
                {
                    id: 1,
                    productName: "Test Pro Fix",
                    quantity: 1,
                    price: 2500
                }
            ],
            formattedItemsText: "Produit : Test Pro Fix\nAccès : *FIXED-WHATSAPP-CONN*\n\n"
        }
    };

    console.log("Sending fixed payload to n8n...");
    try {
        const res = await fetch('http://localhost:5678/webhook/flexbox', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log("n8n Response Status:", res.status);
        const text = await res.text();
        console.log("n8n Response Body:", text);
    } catch (e) {
        console.error("Error connecting to n8n:", e.message);
    }
}

testDelivery();
