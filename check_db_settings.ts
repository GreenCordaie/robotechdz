import { db } from './src/db';
import { shopSettings } from './src/db/schema';

async function checkSettings() {
    const settings = await db.query.shopSettings.findFirst();
    console.log('Chatbot Enabled:', settings?.chatbotEnabled);
    console.log('n8n Webhook URL:', settings?.n8nWebhookUrl);
    process.exit(0);
}

checkSettings();
