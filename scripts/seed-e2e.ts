/**
 * Seed E2E — fixtures pour tests Playwright.
 * Idempotent : peut être lancé plusieurs fois sans dupliquer.
 *
 * Lance avec :
 *   set -a && source .env.test && set +a
 *   npx tsx scripts/seed-e2e.ts
 *
 * Ou via : npm run test:seed
 *
 * AUCUN appel externe (Telegram/WhatsApp/LoadBrain/Microsoft) — uniquement DB.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import {
    users,
    resellers,
    resellerWallets,
    resellerTiers,
    shopSettings,
    categories,
    products,
    productVariants,
    digitalCodes,
} from "../src/db/schema";

if (!process.env.DATABASE_URL) {
    console.error("[seed-e2e] DATABASE_URL manquante. Source .env.test d'abord.");
    process.exit(1);
}
if (!process.env.DATABASE_URL.includes("pc_ia_test")) {
    console.error(
        "[seed-e2e] PROTECTION : ce script refuse de tourner sur une DB qui n'est pas pc_ia_test."
    );
    console.error("DATABASE_URL=" + process.env.DATABASE_URL);
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 5 });
const db = drizzle(sql);

async function seed() {
    console.log("[seed-e2e] Démarrage seed sur", process.env.DATABASE_URL);

    // ─── 1. Shop settings (singleton) ──────────────────────────────────────
    const existingShop = await db.select().from(shopSettings).limit(1);
    if (existingShop.length === 0) {
        await db.insert(shopSettings).values({
            shopName: "FLEXBOX TEST",
            accentColor: "#ec5b13",
            isB2bEnabled: true,
            usdExchangeRate: "245.00",
            stockAlertThreshold: 5,
        });
        console.log("  ✓ shopSettings créés");
    } else {
        await db
            .update(shopSettings)
            .set({ isB2bEnabled: true })
            .where(eq(shopSettings.id, existingShop[0].id));
        console.log("  ✓ shopSettings mis à jour (B2B activé)");
    }

    // ─── 2. Reseller tiers (Bronze/Silver/Gold) ────────────────────────────
    const existingTiers = await db.select().from(resellerTiers);
    if (existingTiers.length === 0) {
        await db.insert(resellerTiers).values([
            { name: "BRONZE", discountPct: "0", minMonthlyVolumeDzd: "0", color: "#cd7f32", isDefault: true, rank: 1 },
            { name: "SILVER", discountPct: "5", minMonthlyVolumeDzd: "50000", color: "#c0c0c0", isDefault: false, rank: 2 },
            { name: "GOLD", discountPct: "10", minMonthlyVolumeDzd: "200000", color: "#ffd700", isDefault: false, rank: 3 },
        ]);
        console.log("  ✓ 3 tiers créés (Bronze 0%, Silver 5%, Gold 10%)");
    } else {
        console.log("  - tiers déjà présents");
    }

    // ─── 3. Admin user (test) ──────────────────────────────────────────────
    const passwordHash = await bcrypt.hash("AdminTest123!", 10);
    const pinHash = await bcrypt.hash("1234", 10);

    const existingAdmin = await db.select().from(users).where(eq(users.email, "admin@e2e.test"));
    if (existingAdmin.length === 0) {
        await db.insert(users).values({
            nom: "Admin Test",
            email: "admin@e2e.test",
            passwordHash,
            pinCode: pinHash,
            role: "ADMIN",
            tokenVersion: 1,
        });
        console.log("  ✓ admin user créé (admin@e2e.test / AdminTest123!)");
    } else {
        console.log("  - admin déjà présent");
    }

    // ─── 4. Reseller user + wallet (test) ──────────────────────────────────
    const existingReseller = await db.select().from(users).where(eq(users.email, "reseller@e2e.test"));
    let resellerUserId: number;
    if (existingReseller.length === 0) {
        const [u] = await db
            .insert(users)
            .values({
                nom: "Reseller Test",
                email: "reseller@e2e.test",
                passwordHash,
                pinCode: pinHash,
                role: "RESELLER",
                tokenVersion: 1,
            })
            .returning();
        resellerUserId = u.id;
        console.log("  ✓ reseller user créé (reseller@e2e.test / PIN 1234)");
    } else {
        resellerUserId = existingReseller[0].id;
        console.log("  - reseller user déjà présent");
    }

    const bronzeTier = await db.select().from(resellerTiers).where(eq(resellerTiers.name, "BRONZE"));
    const tierId = bronzeTier[0]?.id ?? null;

    const existingResellerCompany = await db
        .select()
        .from(resellers)
        .where(eq(resellers.userId, resellerUserId));
    let resellerId: number;
    if (existingResellerCompany.length === 0) {
        const [r] = await db
            .insert(resellers)
            .values({
                userId: resellerUserId,
                companyName: "E2E Test Company",
                contactPhone: "+213555000000",
                status: "ACTIVE",
                tierId,
            })
            .returning();
        resellerId = r.id;
        console.log("  ✓ reseller company créée (id " + resellerId + ", tier BRONZE)");
    } else {
        resellerId = existingResellerCompany[0].id;
        if (existingResellerCompany[0].tierId !== tierId) {
            await db.update(resellers).set({ tierId }).where(eq(resellers.id, resellerId));
        }
        console.log("  - reseller company déjà présent (id " + resellerId + ")");
    }

    const existingWallet = await db
        .select()
        .from(resellerWallets)
        .where(eq(resellerWallets.resellerId, resellerId));
    if (existingWallet.length === 0) {
        await db.insert(resellerWallets).values({
            resellerId,
            balance: "100000.00",
            totalSpent: "0",
        });
        console.log("  ✓ wallet créé (balance: 100,000 DZD)");
    } else {
        console.log("  - wallet déjà présent (balance " + existingWallet[0].balance + ")");
    }

    // ─── 5. Categories ────────────────────────────────────────────────────
    const existingCategories = await db.select().from(categories);
    let catId: number;
    if (existingCategories.length === 0) {
        const [c] = await db.insert(categories).values({ name: "Streaming" }).returning();
        catId = c.id;
        console.log("  ✓ catégorie 'Streaming' créée");
    } else {
        catId = existingCategories[0].id;
        console.log("  - catégorie déjà présente");
    }

    // ─── 6. Products + variants (visibles reseller) ────────────────────────
    const existingProducts = await db.select().from(products);
    let p1Id: number;
    if (existingProducts.length === 0) {
        const [p1] = await db
            .insert(products)
            .values({
                name: "Netflix Premium Test",
                description: "Compte Netflix Premium pour tests E2E",
                categoryId: catId,
                isManualDelivery: false,
                status: "ACTIVE",
            })
            .returning();
        p1Id = p1.id;

        // Variant avec stock (codes en DB)
        const [v1] = await db
            .insert(productVariants)
            .values({
                productId: p1.id,
                name: "1 mois",
                salePriceDzd: "2000.00",
                resellerVisible: true,
                resellerPriceOverrideDzd: "1500.00",
                kioskVisible: true,
                isSharing: false,
                totalSlots: 1,
            })
            .returning();

        // 5 codes DISPONIBLE
        for (let i = 0; i < 5; i++) {
            await db.insert(digitalCodes).values({
                variantId: v1.id,
                code: "TEST-CODE-" + i + "-" + Date.now(),
                status: "DISPONIBLE",
            });
        }

        // Variant LoadBrain (sans codes en DB → "auto")
        await db.insert(productVariants).values({
            productId: p1.id,
            name: "12 mois (LoadBrain)",
            salePriceDzd: "20000.00",
            resellerVisible: true,
            kioskVisible: true,
            isSharing: false,
            totalSlots: 1,
            loadbrainSlug: "test-iptv-12m",
        });

        // Variant non visible reseller (kiosque only)
        await db.insert(productVariants).values({
            productId: p1.id,
            name: "Kiosk only",
            salePriceDzd: "1000.00",
            resellerVisible: false,
            kioskVisible: true,
            isSharing: false,
            totalSlots: 1,
        });

        console.log("  ✓ Product 'Netflix Premium Test' créé avec 3 variants (stock / LoadBrain / kiosk-only)");
    } else {
        p1Id = existingProducts[0].id;
        console.log("  - products déjà présents (" + existingProducts.length + ")");
    }

    console.log("\n[seed-e2e] ✅ Seed terminé.");
    console.log("Fixtures :");
    console.log("  Admin    : admin@e2e.test     / AdminTest123!");
    console.log("  Reseller : reseller@e2e.test  / PIN: 1234   (wallet 100,000 DZD, tier BRONZE)");
    console.log("");

    await sql.end();
}

seed().catch((err) => {
    console.error("[seed-e2e] ERREUR:", err);
    process.exit(1);
});
