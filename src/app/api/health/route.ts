import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { sql, and, lt, eq } from "drizzle-orm";
import { getCachedSettings } from "@/lib/security";

export const dynamic = "force-dynamic";

interface ServiceStatus {
    name: string;
    status: "ok" | "degraded";
    responseTimeMs: number;
    errorMessage?: string;
}

async function checkWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
): Promise<{ result?: T; error?: string; elapsedMs: number }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startTime = Date.now();

    try {
        const result = await fn();
        return { result, elapsedMs: Date.now() - startTime };
    } catch (err: any) {
        return { error: err?.message || "Unknown error", elapsedMs: Date.now() - startTime };
    } finally {
        clearTimeout(timer);
    }
}

export async function GET(): Promise<NextResponse> {
    const settings = await getCachedSettings().catch(() => null);

    const telegramToken = settings?.telegramBotToken || "";
    const whatsappApiUrl = (settings as any)?.whatsappApiUrl || "";
    const whatsappInstanceName = (settings as any)?.whatsappInstanceName || "";

    const [dbResult, telegramResult, whatsappResult, printResult] = await Promise.allSettled([
        // 1. DB check
        checkWithTimeout(async () => {
            await db.execute(sql`SELECT 1`);
            return true;
        }, 3000),

        // 2. Telegram check
        checkWithTimeout(async () => {
            if (!telegramToken) throw new Error("Telegram token not configured");
            const response = await fetch(`https://api.telegram.org/bot${telegramToken}/getMe`, {
                method: "GET",
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return true;
        }, 3000),

        // 3. WhatsApp check
        checkWithTimeout(async () => {
            if (!whatsappApiUrl || !whatsappInstanceName) throw new Error("WhatsApp not configured");
            const response = await fetch(`${whatsappApiUrl}/api/instance/${whatsappInstanceName}`, {
                method: "GET",
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return true;
        }, 3000),

        // 4. Print queue check — count orders with print_pending older than 10 min
        checkWithTimeout(async () => {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            const result = await db
                .select({ count: sql<number>`count(*)` })
                .from(orders)
                .where(
                    and(
                        eq(orders.printStatus, "print_pending"),
                        lt(orders.createdAt, tenMinutesAgo)
                    )
                );
            const stuckCount = Number(result[0]?.count ?? 0);
            if (stuckCount > 0) throw new Error(`${stuckCount} commande(s) bloquée(s) en impression`);
            return true;
        }, 3000),
    ]);

    function resolveService(
        name: string,
        settled: PromiseSettledResult<{ result?: boolean; error?: string; elapsedMs: number }>
    ): ServiceStatus {
        if (settled.status === "fulfilled") {
            const { result, error, elapsedMs } = settled.value;
            if (error) {
                return { name, status: "degraded", responseTimeMs: elapsedMs, errorMessage: error };
            }
            return { name, status: "ok", responseTimeMs: elapsedMs };
        }
        return {
            name,
            status: "degraded",
            responseTimeMs: 0,
            errorMessage: settled.reason?.message || "Promise rejected",
        };
    }

    const services: ServiceStatus[] = [
        resolveService("Database", dbResult),
        resolveService("Telegram", telegramResult),
        resolveService("WhatsApp", whatsappResult),
        resolveService("Print Queue", printResult),
    ];

    const overallStatus = services.every((s) => s.status === "ok") ? "ok" : "degraded";

    return NextResponse.json(
        {
            status: overallStatus,
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            services,
        },
        { status: 200 }
    );
}
