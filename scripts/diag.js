const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { webhookEvents, auditLogs, shopSettings } = require('./src/db/schema');
const { desc, eq } = require('drizzle-orm');
const dotenv = require('dotenv');

// We'll try to use the DB_URL from .env.local or process.env
const dbUrl = process.env.DATABASE_URL;

async function run() {
    if (!dbUrl) {
        console.error("DATABASE_URL non trouvée.");
        return;
    }

    const queryClient = postgres(dbUrl);
    const db = drizzle(queryClient);

    console.log("--- 5 DERNIERS EVENEMENTS WEBHOOK ---");
    const events = await db.select().from(webhookEvents).orderBy(desc(webhookEvents.processedAt)).limit(5);
    console.log(JSON.stringify(events, null, 2));

    console.log("\n--- 5 DERNIERS AUDIT LOGS (NETFLIX) ---");
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'NETFLIX_RESOLVE_AUTO')).orderBy(desc(auditLogs.timestamp)).limit(5);
    console.log(JSON.stringify(logs, null, 2));

    console.log("\n--- CONFIGURATION RELAIS ---");
    const settings = await db.select().from(shopSettings).limit(1);
    if (settings[0]) {
        console.log("Relais Email:", settings[0].netflixResolverEmail);
        console.log("Relais Pass:", settings[0].netflixResolverPassword ? 'DÉFINI' : 'VIDE');
    }

    await queryClient.end();
}

run().catch(console.error);
