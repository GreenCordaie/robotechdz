
import { db } from "@/db";
import { digitalCodes } from "@/db/schema";
import { isNull, ne, and, or } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

async function checkAccounts() {
    const accounts = await db.query.digitalCodes.findMany();

    console.log(`Total accounts: ${accounts.length}`);

    const microsoftAccounts = accounts.filter(acc => {
        const decoded = decrypt(acc.code);
        return decoded.includes("hotmail") || decoded.includes("outlook") || decoded.includes("live") || decoded.includes("msn");
    });

    console.log(`Microsoft accounts found: ${microsoftAccounts.length}`);

    microsoftAccounts.forEach(acc => {
        const emailRaw = decrypt(acc.code);
        const [email] = emailRaw.split('|').map(s => s.trim());
        console.log(`- ID ${acc.id}: ${email} | Graph: ${acc.msStatus || 'NONE'}`);
    });
}

checkAccounts().catch(console.error);
