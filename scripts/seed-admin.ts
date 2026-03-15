import { db } from "../src/db";
import { users } from "../src/db/schema";
import bcrypt from "bcryptjs";

async function seed() {
    console.log("Seeding admin user...");

    const passwordHash = await bcrypt.hash("admin123", 10);

    try {
        await db.insert(users).values({
            nom: "Admin",
            email: "admin@flexbox.dz",
            passwordHash: passwordHash,
            pinCode: "1234",
            role: "ADMIN",
        });
        console.log("Admin user created: admin@flexbox.dz / admin123 (PIN: 1234)");
    } catch (error) {
        console.error("Error seeding admin:", error);
    }
}

seed();
