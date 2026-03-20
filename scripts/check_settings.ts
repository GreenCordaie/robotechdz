import { db } from '../src/db';
import { shopSettings } from '../src/db/schema';

async function check() {
    try {
        const settings = await db.select().from(shopSettings).limit(1);
        console.log('SHOP_SETTINGS:', JSON.stringify(settings, null, 2));
        process.exit(0);
    } catch (e) {
        console.error('Error checking settings:', e);
        process.exit(1);
    }
}

check();
