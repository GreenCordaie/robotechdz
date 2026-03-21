const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.shopSettings.updateMany({
        data: {
            telegramBotToken: '8654979494:AAFkggRLkgWcNB3tcsXyzFsbPOXRPdlpm7Q',
            telegramChatIdAdmin: '8567482274',
            telegramChatIdCaisse: '8567482274',
            telegramChatIdTraiteur: '8567482274'
        }
    });

    console.log("Settings successfully updated in Postgres.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
