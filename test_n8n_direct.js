const { N8nService } = require('./src/services/n8n.service');
const { db } = require('./src/db');

async function test() {
    console.log("Testing N8nService.triggerEvent directly...");
    try {
        const result = await N8nService.triggerEvent("WHATSAPP_SUPPORT", {
            test: true,
            data: { message: { conversation: "test" }, key: { remoteJid: "12345@s.whatsapp.net" } }
        });
        console.log("Result:", result);
    } catch (err) {
        console.error("Direct Error:", err);
    }
    process.exit(0);
}

test();
