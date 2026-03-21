const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const settings = await prisma.shopSettings.findFirst();
    if (settings) {
        console.log(JSON.stringify({
            tg_token: settings.telegramBotToken,
            tg_caisse: settings.telegramChatIdCaisse,
            n8n_url: settings.n8nWebhookUrl
        }, null, 2));
    } else {
        console.log('No settings found');
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
