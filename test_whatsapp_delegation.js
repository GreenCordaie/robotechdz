async function testDelegation() {
    const WEBHOOK_URL = 'http://localhost:1556/api/webhooks/whatsapp';
    const API_KEY = 'abc'; // Based on test_wa.js

    const payload = {
        event: "messages.upsert",
        data: {
            key: {
                remoteJid: "213781480740@s.whatsapp.net",
                fromMe: false,
                id: "TEST_MSG_" + Date.now()
            },
            message: {
                conversation: "Bonjour, j'ai une question sur ma commande."
            },
            pushName: "Test User"
        }
    };

    console.log("Sending test message to:", WEBHOOK_URL);
    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': API_KEY
            },
            body: JSON.stringify(payload)
        });

        console.log("Status:", response.status);
        const data = await response.json();
        console.log("Response JSON:", JSON.stringify(data, null, 2));

        if (response.ok) {
            console.log("SUCCESS: Webhook accepted the message.");
        } else {
            console.log("FAILED: Webhook rejected the message. (Maybe API_KEY is wrong or WHATSAPP_WEBHOOK_SECRET is not set)");
        }
    } catch (err) {
        console.error("Error:", err.message);
    }
}

testDelegation();
