const { N8nService } = require('./src/services/n8n.service');
const dotenv = require('dotenv');
const path = require('path');

// Load .env
dotenv.config({ path: path.join(__dirname, '.env') });

async function testN8n() {
    console.log("Testing N8nService integration...");
    console.log("Webhook URL:", process.env.N8N_WEBHOOK_URL);

    // Mock serverOnly to avoid error in non-Next environment
    global.serverOnly = () => { };

    const result = await N8nService.triggerEvent('INTEGRATION_TEST', {
        test: true,
        message: "Hello from FLEXBOX backend test script!"
    });

    if (result) {
        console.log("✅ Integration test SUCCESSFUL. Event sent to n8n.");
    } else {
        console.log("❌ Integration test FAILED. Check if n8n is running and the webhook is active.");
    }
}

testN8n();
