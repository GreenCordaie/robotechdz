const postgres = require('postgres');
const bcrypt = require('bcryptjs');

const sql = postgres("postgres://user:password@localhost:5435/flexbox");

async function main() {
    try {
        // 1. Test connection
        const test = await sql`SELECT 1 as test`;
        console.log("DB Connection OK");

        // 2. Check if user exists
        const users = await sql`SELECT id, email, role, nom, password_hash FROM users WHERE email = 'admin@flexbox.dz'`;
        console.log("Users found:", users.length);

        if (users.length === 0) {
            console.log("No user with email admin@flexbox.dz!");
            const allUsers = await sql`SELECT id, email, role, nom FROM users`;
            console.log("ALL USERS:", JSON.stringify(allUsers, null, 2));
        } else {
            const user = users[0];
            console.log("User:", JSON.stringify({ id: user.id, email: user.email, role: user.role, nom: user.nom }, null, 2));
            console.log("Hash:", user.password_hash);

            const isValid = await bcrypt.compare('admin123', user.password_hash);
            console.log("Password 'admin123' valid:", isValid);

            if (!isValid) {
                // Re-hash admin123 and show for comparison
                const newHash = await bcrypt.hash('admin123', 10);
                console.log("New hash for admin123:", newHash);
            }
        }
    } catch (e) {
        console.log("ERROR:", e.message);
        console.log("STACK:", e.stack);
    } finally {
        await sql.end();
    }
}

main();
