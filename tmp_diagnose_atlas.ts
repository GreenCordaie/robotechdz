import { db } from './src/db';
import { products, productVariants, digitalCodes, digitalCodeSlots } from './src/db/schema';
import { eq, ilike, sql } from 'drizzle-orm';
import { decrypt } from './src/lib/encryption';

async function diagnose() {
    console.log("--- Recherche du produit Atlas Pro ---");
    const atlasProducts = await db.select().from(products).where(ilike(products.name, '%atlas pro%'));

    if (atlasProducts.length === 0) {
        console.log("Produit introuvable avec le nom 'Atlas Pro'");
        return;
    }

    for (const p of atlasProducts) {
        console.log(`\nProduit: ${p.id} | Nom: ${p.name} | Manuel: ${p.isManualDelivery}`);

        const variants = await db.select().from(productVariants).where(eq(productVariants.productId, p.id));
        for (const v of variants) {
            console.log(`  -> Variante: ${v.id} | Nom: ${v.name} | Prix: ${v.salePriceDzd} DZD`);

            const codes = await db.select().from(digitalCodes).where(eq(digitalCodes.variantId, v.id));
            if (codes.length === 0) {
                console.log("     [!] Aucun code trouvé dans digital_codes");
            } else {
                console.log(`     [OK] ${codes.length} codes trouvés:`);
                for (const c of codes) {
                    const decrypted = decrypt(c.code) || "[NON DECRYPTABLE]";
                    console.log(`        ID: ${c.id} | Status: ${c.status} | Code: ${decrypted.substring(0, 10)}... | Créé le: ${c.createdAt}`);

                    if (v.isSharing) {
                        const slots = await db.select().from(digitalCodeSlots).where(eq(digitalCodeSlots.digitalCodeId, c.id));
                        console.log(`        -> ${slots.length} slots pour ce compte:`);
                        for (const s of slots) {
                            console.log(`           Slot ${s.slotNumber} | Status: ${s.status} | ID Commande: ${s.orderItemId}`);
                        }
                    }
                }
            }
        }
    }
}

diagnose().catch(console.error).finally(() => process.exit());
