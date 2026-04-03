const postgres = require('postgres');
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function main() {
    try {
        const result = await sql`
      UPDATE shop_settings 
      SET microsoft_client_secret = 'jdV8Q~CChK1ktwQS6AuztfO4uFpGt~MSgPYC~bk9'
      RETURNING *
    `;
        console.log('Secret Client mis à jour :', result.length ? 'OK' : 'No rows');
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

main();
