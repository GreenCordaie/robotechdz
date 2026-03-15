import { db } from './src/db';
import { shopSettings } from './src/db/schema';

async function check() {
    try {
        const settings = await db.select().from(shopSettings).limit(1);
        console.log("Database Settings:");
        console.log(JSON.stringify(settings[0], null, 2));
    } catch (err) {
        console.error("DB Query Error:", err);
    } finally {
        process.exit(0);
    }
}

check();
