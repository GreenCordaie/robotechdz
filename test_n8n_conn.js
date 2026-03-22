async function test() {
    const webhookUrl = "http://localhost:5678/webhook/flexbox";
    const payload = {
        eventName: "WHATSAPP_SUPPORT",
        config: {
            prompt: "You are a test assistant.",
            greeting: "Hello!"
        },
        data: {
            event: "messages.upsert",
            data: {
                key: { id: "test-id-" + Date.now(), remoteJid: "213555123456@s.whatsapp.net" },
                message: { conversation: "Hello assistant, can you hear me?" }
            }
        }
    };

    console.log(`Testing connection to: ${webhookUrl}`);
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log(`Status: ${response.status}`);
        const result = await response.json();
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (err) {
        console.error("Connection Error:", err.message);
    }
}

test();
