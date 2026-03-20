import { db } from "@/db";
import { shopSettings } from "@/db/schema";

/**
 * Low-level Telegram sender.
 * Note: Logic moved to n8n. Use triggerEvent for business notifications.
 */
export async function sendTelegramNotification(message: string, roles: ('ADMIN' | 'CAISSIER' | 'TRAITEUR')[] = ['ADMIN']) {
    try {
        const settings = await db.select().from(shopSettings).limit(1);
        if (!settings || settings.length === 0) return;

        const { telegramBotToken, telegramChatIdAdmin, telegramChatIdCaisse, telegramChatIdTraiteur } = settings[0];
        if (!telegramBotToken) return;

        const targetChatIds = new Set<string>();
        roles.forEach(role => {
            if (role === 'ADMIN' && telegramChatIdAdmin) targetChatIds.add(telegramChatIdAdmin);
            if (role === 'CAISSIER' && telegramChatIdCaisse) targetChatIds.add(telegramChatIdCaisse);
            if (role === 'TRAITEUR' && telegramChatIdTraiteur) targetChatIds.add(telegramChatIdTraiteur);
        });

        const sendPromises = Array.from(targetChatIds).map(chatId =>
            fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: "Markdown"
                }),
            })
        );

        await Promise.all(sendPromises);
    } catch (error) {
        console.error("Telegram transport failed:", error);
    }
}
