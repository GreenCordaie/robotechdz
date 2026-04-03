const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const accounts = await prisma.sharedAccount.findMany({
        select: { email: true, status: true, msStatus: true }
    });
    console.log(JSON.stringify(accounts, null, 2));
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
