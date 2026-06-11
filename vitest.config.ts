import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "server-only": path.resolve(__dirname, "./tests/shims/server-only.ts"),
        },
    },
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"],
        // shop_settings secret columns are now encrypted at rest, so importing
        // @/db/schema loads @/lib/encryption, which requires a key at module load.
        // Provide fixed test keys (matches CI's job-level env) so any schema-importing
        // suite runs without each file having to set one. Never used in prod.
        env: {
            ENCRYPTION_KEY: "test_encryption_key_unit_NEVER_USE_IN_PROD",
            SESSION_SECRET: "test_session_secret_unit_NEVER_USE_IN_PROD",
        },
    },
});
