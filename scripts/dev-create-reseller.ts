/**
 * DEV-ONLY: Create a reseller account directly (bypasses the b2b signup flow).
 *
 * Usage:
 *   npx tsx scripts/dev-create-reseller.ts <email> <pin> [companyName]
 *
 * Example:
 *   npx tsx scripts/dev-create-reseller.ts rv@test.com 1234 "RV Test Shop"
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

const { users, resellers, resellerWallets, resellerTiers } = schema;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error("DATABASE_URL must be set");
    process.exit(1);
}
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

async function main() {
    const [, , emailArg, pinArg, companyArg] = process.argv;
    const email = emailArg || "rv@test.com";
    const pin = pinArg || "1234";
    const companyName = companyArg || "RV Test Shop";

    if (!/^\d{4}$/.test(pin)) {
        console.error("PIN must be 4 digits");
        process.exit(1);
    }

    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) {
        if (existing.role !== "RESELLER") {
            console.error(`User ${email} already exists with role ${existing.role}. Aborting.`);
            process.exit(1);
        }
        const pinHash = await bcrypt.hash(pin, 10);
        await db.update(users).set({ pinCode: pinHash, tokenVersion: (existing.tokenVersion ?? 0) + 1 }).where(eq(users.id, existing.id));
        console.log(`✓ Reseller user ${email} already existed — PIN reset to ${pin}, tokenVersion bumped.`);
        process.exit(0);
    }

    const passwordHash = await bcrypt.hash(Math.random().toString(36).slice(2, 14), 10);
    const pinHash = await bcrypt.hash(pin, 10);

    const defaultTier = await db.query.resellerTiers.findFirst({ where: eq(resellerTiers.isDefault, true) });

    await db.transaction(async (tx) => {
        const [newUser] = await tx
            .insert(users)
            .values({
                nom: companyName,
                email,
                passwordHash,
                pinCode: pinHash,
                role: "RESELLER",
                tokenVersion: 1,
            })
            .returning();

        const [newReseller] = await tx
            .insert(resellers)
            .values({
                userId: newUser.id,
                companyName,
                contactPhone: "+213000000000",
                status: "ACTIVE",
                tierId: defaultTier?.id ?? null,
            })
            .returning();

        await tx.insert(resellerWallets).values({
            resellerId: newReseller.id,
            balance: "0",
            totalSpent: "0",
        });
    });

    console.log(`✓ Reseller created`);
    console.log(`  email: ${email}`);
    console.log(`  PIN:   ${pin}`);
    console.log(`  → login at /reseller/login`);
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
