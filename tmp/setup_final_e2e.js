const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- MS Graph Final E2E Setup ---');

    // 1. Mise à jour des paramètres de la boutique (Tenant ID + Client Credentials si besoin)
    // L'utilisateur a déjà fourni le Client ID 72e03be8-0a78-4e03-8e47-ee2bb1600a09
    // Le Tenant ID est 730d24b2-1a9b-4669-b614-fb73275da7b0

    await prisma.shopSettings.updateMany({
        data: {
            microsoftClientId: '72e03be8-0a78-4e03-8e47-ee2bb1600a09',
            microsoftTenantId: '730d24b2-1a9b-4669-b614-fb73275da7b0', // On utilise le tenant spécifique pour commencer
        }
    });
    console.log('Step 1: Azure Credentials configured.');

    // 2. S'assurer que le compte Netflix existe
    const netflixEmail = 'Arahamplin5568@outlook.com';
    const netflixPass = 'suiRssO358844';

    let account = await prisma.sharedAccount.findFirst({
        where: { email: netflixEmail }
    });

    if (!account) {
        account = await prisma.sharedAccount.create({
            data: {
                email: netflixEmail,
                password: netflixPass,
                type: 'NETFLIX',
                status: 'ACTIVE'
            }
        });
        console.log(`Step 2: Created Netflix account ${netflixEmail}`);
    } else {
        await prisma.sharedAccount.update({
            where: { id: account.id },
            data: { password: netflixPass, status: 'ACTIVE' }
        });
        console.log(`Step 2: Updated Netflix account ${netflixEmail}`);
    }

    // 3. S'assurer que le compte maître est prêt (facultatif, mais utile pour le suivi)
    const masterEmail = 'aymengp12@outlook.com';
    let masterAccount = await prisma.sharedAccount.findFirst({
        where: { email: masterEmail }
    });

    if (!masterAccount) {
        await prisma.sharedAccount.create({
            data: {
                email: masterEmail,
                password: 'Royal@06',
                type: 'NETFLIX', // On le met en Netflix pour qu'il apparaisse dans la liste
                status: 'ACTIVE'
            }
        });
        console.log(`Step 3: Created Master account ${masterEmail}`);
    }

    console.log('--- Setup successful! READY ---');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
