import "server-only";
import { LoadBrainClient, validateConfig } from "@loadbrain/site-integration";

if (!process.env.LOADBRAIN_API_KEY) {
    console.warn("[LoadBrain] LOADBRAIN_API_KEY not set — module disabled");
}

export const lbConfig = process.env.LOADBRAIN_API_KEY
    ? validateConfig({
        apiKey: process.env.LOADBRAIN_API_KEY,
        baseUrl: process.env.LOADBRAIN_URL || "http://localhost:3000",
        siteUrl: process.env.LOADBRAIN_SITE_URL || "http://localhost:1556",
        webhookSecret: process.env.LOADBRAIN_WEBHOOK_SECRET || "",
    })
    : null;

export const lbClient = lbConfig ? new LoadBrainClient(lbConfig) : null;

export function isLoadBrainEnabled(): boolean {
    return lbClient !== null;
}
