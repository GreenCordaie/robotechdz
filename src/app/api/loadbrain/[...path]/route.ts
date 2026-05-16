import { createNextRouteHandler, validateConfig } from "@loadbrain/site-integration";

const config = validateConfig({
    apiKey: process.env.LOADBRAIN_API_KEY || "",
    baseUrl: process.env.LOADBRAIN_URL || "http://localhost:3000",
    siteUrl: process.env.LOADBRAIN_SITE_URL || "http://localhost:1556",
    webhookSecret: process.env.LOADBRAIN_WEBHOOK_SECRET || "",
});

export const { GET, POST, DELETE } = createNextRouteHandler(config);
