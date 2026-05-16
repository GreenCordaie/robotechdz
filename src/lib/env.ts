import "server-only";
import { z } from "zod";

/**
 * Runtime environment validation.
 *
 * Pourquoi : on a déjà été mordus par des `process.env.X` undefined silencieux
 * (ex: ENCRYPTION_KEY → fallback SESSION_SECRET → données illisibles plus tard).
 * Ce module crashe le boot Node tôt et bruyamment si une variable critique manque.
 *
 * Important : ce module ne tourne pas sur l'Edge Runtime. Pour les routes Edge,
 * la validation doit être faite dans la route elle-même.
 */

const required = z.string().min(1, "obligatoire");
const requiredSecret = z
    .string()
    .min(32, "doit faire au moins 32 caractères (génère avec: openssl rand -hex 32)");

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    DATABASE_URL: required,
    SESSION_SECRET: requiredSecret,
    ENCRYPTION_KEY: requiredSecret.optional(),

    REDIS_URL: z.string().optional(),

    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    ENABLE_DEBUG_ROUTES: z.enum(["true", "false"]).default("false"),
});

type EnvSchema = z.infer<typeof envSchema>;

let cachedEnv: EnvSchema | null = null;

function loadEnv(): EnvSchema {
    if (cachedEnv) return cachedEnv;

    const parsed = envSchema.safeParse(process.env);

    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
            .join("\n");
        const message = `[ENV] Validation failed:\n${issues}\n\nVoir .env.example pour la liste complète.`;
        // En dev on log + throw. En prod on crash le process.
        if (process.env.NODE_ENV === "production") {
            console.error(message);
            process.exit(1);
        }
        throw new Error(message);
    }

    cachedEnv = parsed.data;

    if (!cachedEnv.ENCRYPTION_KEY) {
        console.warn(
            "[ENV] ENCRYPTION_KEY manquante — fallback sur SESSION_SECRET. " +
            "À régulariser : voir docs/superpowers/plans/2026-05-13-epic-0-stabilization.md."
        );
    }

    return cachedEnv;
}

export const env = new Proxy({} as EnvSchema, {
    get(_target, prop: string) {
        const e = loadEnv();
        return (e as any)[prop];
    },
});
