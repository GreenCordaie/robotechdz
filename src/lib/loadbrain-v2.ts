import "server-only";
import { LoadBrainClient } from "@loadbrain/sdk-v2";

/**
 * SDK v2 client side-by-side with the legacy `lbClient` from `./loadbrain.ts`.
 *
 * Both can coexist during the migration. Switch endpoints over to lbV2 one
 * by one behind LOADBRAIN_USE_V2=true. Once all critical paths are migrated
 * and verified in prod, remove the legacy lbClient + @loadbrain/site-integration dep.
 */
export const lbV2: LoadBrainClient | null = process.env.LOADBRAIN_API_KEY
    ? new LoadBrainClient({
          apiKey: process.env.LOADBRAIN_API_KEY,
          baseUrl: process.env.LOADBRAIN_URL ?? "http://localhost:3000",
          retry: { max: 3, backoff: "expo" },
          timeoutMs: 8_000,
      })
    : null;

export function isLoadBrainV2Enabled(): boolean {
    return lbV2 !== null && process.env.LOADBRAIN_USE_V2 === "true";
}
