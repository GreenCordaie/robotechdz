import { db } from '../src/db';
import { digitalCodes } from '../src/db/schema';
import { encrypt, decrypt } from '../src/lib/encryption';

async function run() {
    const list = await db.query.digitalCodes.findMany({
        limit: 10
    });

    for (const item of list) {
        if (item.code) {
            console.log(`ID: ${item.id} - Email: ${decrypt(item.code).split('|')[0]} - Status: ${item.msStatus}`);
        }
    }
    process.exit(0);
}
run();
