const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const email = 'Arahamplin5568@outlook.com';
    const accounts = await prisma.sharedAccount.findMany({
        where: { email }
    });

    if (accounts.length > 1) {
        console.log(`Trouvé ${accounts.length} doublons pour ${email}. Suppression...`);
        // Garder le premier (celui qui a peut-être le token)
        const [keep, ...others] = accounts;
        for (const other of others) {
            await prisma.sharedAccount.delete({ where: { id: other.id } });
        }
        console.log("Doublons supprimés.");
    } else {
        console.log("Aucun doublon trouvé.");
    }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
