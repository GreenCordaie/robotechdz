import { db } from "@/db";
import { shopSettings } from "@/db/schema";

export async function sendTelegramNotification(message: string, roles: ('ADMIN' | 'CAISSIER' | 'TRAITEUR')[] = ['ADMIN']) {
    try {
        const settings = await db.select().from(shopSettings).limit(1);
        if (!settings || settings.length === 0) return;

        const { telegramBotToken, telegramChatId, telegramChatIdAdmin, telegramChatIdCaisse, telegramChatIdTraiteur } = settings[0];

        if (!telegramBotToken) {
            console.warn("Telegram notification skipped: Missing Bot Token in shopSettings.");
            return;
        }

        // Collect unique chat IDs based on roles
        const targetChatIds = new Set<string>();

        // Always include default chat ID if present (legacy support)
        if (telegramChatId) targetChatIds.add(telegramChatId);

        roles.forEach(role => {
            if (role === 'ADMIN' && telegramChatIdAdmin) targetChatIds.add(telegramChatIdAdmin);
            if (role === 'CAISSIER' && telegramChatIdCaisse) targetChatIds.add(telegramChatIdCaisse);
            if (role === 'TRAITEUR' && telegramChatIdTraiteur) targetChatIds.add(telegramChatIdTraiteur);
        });

        if (targetChatIds.size === 0) {
            console.warn("Telegram notification skipped: No target Chat IDs found for roles:", roles);
            return;
        }

        // Send to all unique target chat IDs
        const sendPromises = Array.from(targetChatIds).map(chatId =>
            fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: "Markdown",
                }),
            }).then(async res => {
                if (!res.ok) {
                    const errorData = await res.json();
                    console.error(`Telegram API Error for ChatID ${chatId}:`, errorData);
                }
            })
        );

        await Promise.all(sendPromises);
    } catch (error) {
        console.error("Failed to send Telegram notifications:", error);
    }
}
