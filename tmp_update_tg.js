const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateSettings() {
    try {
        const settings = await prisma.shopSettings.findFirst();
        if (settings) {
            await prisma.shopSettings.update({
                where: { id: settings.id },
                data: {
                    telegramToken: "8654979494:AAFkggRLkgWcNB3tcsXyzFsbPOXRPdlpm7Q",
                    telegramCaisseChatId: "8567482274",
                    telegramTraiteurChatId: "8567482274"
                }
            });
            console.log("✅ Credentials Telegram mis à jour avec succès dans la DB.");
        } else {
            console.log("❌ Aucun paramètre trouvé en base.");
        }
    } catch (e) {
        console.error("❌ Erreur lors de la mise à jour :", e);
    } finally {
        await prisma.$disconnect();
    }
}

updateSettings();
