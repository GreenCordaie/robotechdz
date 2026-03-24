import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error("DATABASE_URL non définie dans l'environnement");
    process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function diagnose() {
    try {
        console.log("--- Recherche du produit Atlas Pro ---");
        const atlasProducts = await sql`SELECT * FROM products WHERE name ILIKE '%atlas pro%'`;

        if (atlasProducts.length === 0) {
            console.log("Produit introuvable avec le nom 'Atlas Pro'");
            return;
        }

        for (const p of atlasProducts) {
            console.log(`\nProduit: ${p.id} | Nom: ${p.name} | Manuel: ${p.is_manual_delivery}`);

            const variants = await sql`SELECT * FROM product_variants WHERE product_id = ${p.id}`;
            for (const v of variants) {
                console.log(`  -> Variante: ${v.id} | Nom: ${v.name} | Prix: ${v.sale_price_dzd} DZD | IsSharing: ${v.is_sharing}`);

                const codes = await sql`SELECT * FROM digital_codes WHERE variant_id = ${v.id}`;
                if (codes.length === 0) {
                    console.log("     [!] Aucun code trouvé dans digital_codes");
                } else {
                    console.log(`     [OK] ${codes.length} codes trouvés:`);
                    for (const c of codes) {
                        console.log(`        ID: ${c.id} | Status: ${c.status} | Créé le: ${c.created_at}`);

                        if (v.is_sharing) {
                            const slots = await sql`SELECT * FROM digital_code_slots WHERE digital_code_id = ${c.id}`;
                            console.log(`        -> ${slots.length} slots pour ce compte:`);
                            for (const s of slots) {
                                console.log(`           Slot ${s.slotNumber} | Status: ${s.status} | ID Commande: ${s.order_item_id}`);
                            }
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error("Erreur SQL:", err);
    } finally {
        await sql.end();
    }
}

diagnose();
