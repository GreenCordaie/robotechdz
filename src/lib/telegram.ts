import { db } from "@/db";
import { shopSettings } from "@/db/schema";

export async function sendTelegramNotification(message: string) {
    try {
        const settings = await db.select().from(shopSettings).limit(1);
        if (!settings || settings.length === 0) return;

        const { telegramBotToken, telegramChatId } = settings[0];

        if (!telegramBotToken || !telegramChatId) {
            console.warn("Telegram notification skipped: Missing credentials in shopSettings.");
            return;
        }

        const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                chat_id: telegramChatId,
                text: message,
                parse_mode: "Markdown",
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Telegram API Notification Error:", errorData);
        }
    } catch (error) {
        console.error("Failed to send Telegram notification:", error);
    }
}
