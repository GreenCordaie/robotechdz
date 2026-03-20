import "server-only";
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL must be set");
}

// Use a global variable to preserve the database connection across HMR in development
const globalForDb = global as unknown as {
    client: ReturnType<typeof postgres> | undefined;
};

const client = globalForDb.client || postgres(connectionString, {
    max: 10, // Limit pool size
    idle_timeout: 20,
    connect_timeout: 10,
});

if (process.env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle(client, { schema });
