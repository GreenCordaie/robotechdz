import { db } from "./index";
import { categories, products, productVariants, productVariantSuppliers, suppliers } from "./schema";
import { eq } from "drizzle-orm";

async function seed() {
    console.log("🌱 Seeding Module 3 data...");

    // 1. Get existing suppliers
    const allSuppliers = await db.select().from(suppliers);
    if (allSuppliers.length === 0) {
        console.log("❌ No suppliers found. Please add suppliers first.");
        return;
    }

    const supplier1 = allSuppliers[0];
    const supplier2 = allSuppliers[1] || supplier1;

    // 2. Create categories
    const gamingCat = await db.insert(categories).values({
        name: "Gaming",
        icon: "sports_esports"
    }).returning().then(res => res[0]);

    const streamingCat = await db.insert(categories).values({
        name: "Streaming",
        icon: "tv_signin"
    }).returning().then(res => res[0]);

    const giftCardsCat = await db.insert(categories).values({
        name: "Cartes Cadeaux",
        icon: "card_giftcard"
    }).returning().then(res => res[0]);

    // 3. Create products and variants
    // PSN
    const psn = await db.insert(products).values({
        name: "PlayStation Network",
        categoryId: gamingCat.id,
        description: "Cartes prépayées pour le store PlayStation",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/PlayStation_logo.svg/1200px-PlayStation_logo.svg.png"
    }).returning().then(res => res[0]);

    const psn10 = await db.insert(productVariants).values({
        productId: psn.id,
        name: "10 USD",
        salePriceDzd: "2400.00"
    }).returning().then(res => res[0]);

    const psn20 = await db.insert(productVariants).values({
        productId: psn.id,
        name: "20 USD",
        salePriceDzd: "4600.00"
    }).returning().then(res => res[0]);

    // Xbox
    const xbox = await db.insert(products).values({
        name: "Xbox Game Pass",
        categoryId: gamingCat.id,
        description: "Accès illimité à des centaines de jeux",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Xbox_one_logo.svg/1024px-Xbox_one_logo.svg.png"
    }).returning().then(res => res[0]);

    const xbox1 = await db.insert(productVariants).values({
        productId: xbox.id,
        name: "1 Mois Ultimate",
        salePriceDzd: "3200.00"
    }).returning().then(res => res[0]);

    // Netflix
    const netflix = await db.insert(products).values({
        name: "Netflix",
        categoryId: streamingCat.id,
        description: "Streaming de films et séries",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Netflix_2015_logo.svg/1280px-Netflix_2015_logo.svg.png"
    }).returning().then(res => res[0]);

    const netflixBasic = await db.insert(productVariants).values({
        productId: netflix.id,
        name: "Standard 1 Mois",
        salePriceDzd: "1900.00"
    }).returning().then(res => res[0]);

    // 4. Link to suppliers
    await db.insert(productVariantSuppliers).values([
        { variantId: psn10.id, supplierId: supplier1.id, purchasePrice: "9.50", currency: "USD" },
        { variantId: psn20.id, supplierId: supplier1.id, purchasePrice: "19.00", currency: "USD" },
        { variantId: xbox1.id, supplierId: supplier2.id, purchasePrice: "12.00", currency: "USD" },
        { variantId: netflixBasic.id, supplierId: supplier1.id, purchasePrice: "8.00", currency: "USD" },
    ]);

    console.log("✅ Seeding completed!");
    process.exit(0);
}

seed().catch(err => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
});
