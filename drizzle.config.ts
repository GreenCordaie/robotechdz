import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
    throw new Error(
        "DATABASE_URL manquante. Crée un .env (cf .env.example) avant de lancer drizzle-kit."
    );
}

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: { url },
});
