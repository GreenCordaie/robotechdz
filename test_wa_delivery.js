const postgres = require('postgres');

async function test() {
    console.log("Starting test...");
    const sql = postgres("postgres://user:password@localhost:5435/flexbox");

    try {
        const settingsRes = await sql`SELECT * FROM shop_settings LIMIT 1`;
        const settings = settingsRes[0];

        const webhookUrl = settings.n8n_webhook_url;
        const config = {
            tg_token: settings.telegram_bot_token,
            tg_caisse: settings.telegram_chat_id_caisse,
            tg_traiteur: settings.telegram_chat_id_traiteur,
            wa_url: settings.whatsapp_api_url,
            wa_key: settings.whatsapp_api_key,
            wa_instance: settings.whatsapp_instance_name,
        };

        const eventName = "CUSTOMER_DELIVERY";
        const data = {
            orderId: "test-order-id",
            orderNumber: "#TEST-FIX-999",
            customerPhone: "0781480740",
            customerName: "Nagui Test",
            formattedItemsText: "1x Produit Test Fix - Code: FIX-1234-SUCCESS",
            appUrl: "https://supervisors-stretch-surgical-application.trycloudflare.com"
        };

        console.log(`Triggering ${eventName} to ${webhookUrl}...`);
        console.log("Config used:", JSON.stringify(config, null, 2));

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                eventName,
                config,
                data
            })
        });

        console.log("Response Status:", response.status);
        const respData = await response.json();
        console.log("Response Body:", JSON.stringify(respData, null, 2));

    } catch (err) {
        console.error("Test Error:", err);
    } finally {
        await sql.end();
    }
}

test();
