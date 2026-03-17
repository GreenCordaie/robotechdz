const postgres = require('postgres');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    process.exit(1);
}

async function runPatch() {
    let retries = 5;
    while (retries > 0) {
        const sql = postgres(connectionString, { max: 1 });
        try {
            console.log("Attempting to connect...");
            await sql`
        ALTER TABLE categories 
        ADD COLUMN IF NOT EXISTS icon text,
        ADD COLUMN IF NOT EXISTS image_url text;
      `;
            console.log("SUCCESS: categories table patched.");
            return;
        } catch (err) {
            console.error(`Attempt failed (${retries} left):`, err.message);
            if (err.code !== '53300') break; // Only retry on connection pool full
            retries--;
            await new Promise(r => setTimeout(r, 2000));
        } finally {
            await sql.end();
        }
    }
}

runPatch();
