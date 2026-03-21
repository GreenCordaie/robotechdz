import { db } from './src/db';
import { shopSettings } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
    console.log("Updating Telegram settings...");
    await db.update(shopSettings).set({
        telegramBotToken: '8654979494:AAFkggRLkgWcNB3tcsXyzFsbPOXRPdlpm7Q',
        telegramChatIdAdmin: '8567482274',
        telegramChatIdCaisse: '8567482274',
        telegramChatIdTraiteur: '8567482274'
    }).where(eq(shopSettings.id, 1));

    console.log("Settings successfully updated in Postgres.");
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
