import postgres from 'postgres';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        console.log('--- DÉBUT MIGRATION TEST ---');

        // 1. Libérer le slot 105 (Account 272)
        await sql`UPDATE digital_code_slots SET order_item_id = NULL, status = 'DISPONIBLE' WHERE id = 105`;
        console.log('Slot 105 libéré.');

        // 2. Assigner le slot 228 (Account 344 - Graph) à la commande
        await sql`UPDATE digital_code_slots SET order_item_id = 331, status = 'VENDU' WHERE id = 228`;
        console.log('Slot 228 (Graph) assigné à l\'item 331.');

        // 3. Marquer le compte 344 comme VENDU
        await sql`UPDATE digital_codes SET status = 'VENDU' WHERE id = 344`;
        console.log('Compte 344 marqué comme VENDU.');

        console.log('--- MIGRATION TERMINÉE ---');
    } catch (e) {
        console.error('ERREUR MIGRATION:', e);
    } finally {
        process.exit();
    }
}
run();
