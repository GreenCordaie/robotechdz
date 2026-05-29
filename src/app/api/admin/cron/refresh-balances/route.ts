import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { eq, and, sql, isNotNull, lt } from "drizzle-orm";
import { fetchProviderBalance, BalanceFetchError } from "@/lib/balance-fetchers";

/**
 * Cron: refresh balances of all EXTERNAL_API suppliers.
 *
 *   - Bearer auth: header `Authorization: Bearer ${CRON_SECRET}`.
 *   - Runs the registered fetcher for each row's `provider_kind`.
 *   - Persists new balance + last_balance_at; logs failures without aborting.
 *   - Emits an alert payload for each row crossing its `alert_threshold`
 *     downward (one-shot per refresh; downstream notif consumer is TBD).
 *
 * Suggested schedule: every 10 min via VPS cron-tick.sh.
 *
 * Output shape:
 *   {
 *     refreshed:  number,                       // rows successfully updated
 *     failed:     Array<{ id, name, error }>,   // rows that threw
 *     alerts:     Array<{ id, name, balance }>, // rows under their threshold
 *   }
 */
export async function GET(req: NextRequest) {
    const secret = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await db.query.suppliers.findMany({
        where: and(eq(suppliers.type, "EXTERNAL_API"), isNotNull(suppliers.providerKind)),
    });

    const refreshed: number[] = [];
    const failed: Array<{ id: number; name: string; error: string }> = [];
    const alerts: Array<{ id: number; name: string; balance: number; threshold: number }> = [];

    for (const row of rows) {
        if (!row.providerKind) continue;
        try {
            const { value, currency, fetchedAt } = await fetchProviderBalance(
                row.providerKind,
                row.externalConfig,
            );

            await db.update(suppliers).set({
                balance: String(value),
                currency,
                lastBalanceAt: fetchedAt,
            }).where(eq(suppliers.id, row.id));

            refreshed.push(row.id);

            if (row.alertThreshold != null && value < Number(row.alertThreshold)) {
                alerts.push({
                    id: row.id,
                    name: row.name,
                    balance: value,
                    threshold: Number(row.alertThreshold),
                });
            }
        } catch (err) {
            const msg = err instanceof BalanceFetchError ? err.message : (err as Error).message;
            failed.push({ id: row.id, name: row.name, error: msg });
            console.error(`[cron:refresh-balances] ${row.name} (id=${row.id}) failed:`, msg);
        }
    }

    return NextResponse.json({
        refreshed: refreshed.length,
        failed,
        alerts,
        ran_at: new Date().toISOString(),
    });
}
