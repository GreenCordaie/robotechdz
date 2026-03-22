import { NextResponse } from "next/server";
import { OrderService } from "@/services/order.service";
import { AccountService } from "@/services/account.service";
import crypto from "crypto";
import { z } from "zod";

const CodeSchema = z.object({ code: z.string().min(1).max(500) });
const AccountSchema = z.object({
    variantId: z.number().int().positive(),
    email: z.string().email(),
    password: z.string().min(1).max(200),
    expiresAt: z.string().datetime().optional(),
    slotsCount: z.number().int().positive().max(100).optional(),
    slotsConfig: z.any().optional()
});

export async function POST(req: Request) {
    try {
        const n8nSecret = process.env.N8N_CALLBACK_SECRET;
        const body = await req.json();
        const { event, orderId, data, secret } = body;

        if (!n8nSecret || !secret) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const expectedBuffer = Buffer.from(n8nSecret);
        const receivedBuffer = Buffer.from(String(secret));
        if (expectedBuffer.length !== receivedBuffer.length ||
            !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (event === "ATTRIBUER_SLOT") {
            if (data?.codes && Array.isArray(data.codes)) {
                const parsed = z.array(CodeSchema).safeParse(data.codes);
                if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });
                await OrderService.deliverManualCodes(orderId, parsed.data);
                return NextResponse.json({ success: true });
            }
        }

        if (event === "SYNC_NOTION_ACCOUNT") {
            if (data?.accounts && Array.isArray(data.accounts)) {
                const parsed = z.array(AccountSchema).safeParse(data.accounts);
                if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });

                const results = await Promise.all(parsed.data.map(async (account) => {
                    try {
                        const res = await AccountService.addSharedAccountInternal(account);
                        return { email: account.email, success: true, ...res };
                    } catch {
                        return { email: account.email, success: false, error: "Erreur interne" };
                    }
                }));
                return NextResponse.json({ success: true, results });
            }
        }

        return NextResponse.json({ error: "Événement inconnu" }, { status: 400 });
    } catch (error: any) {
        console.error("[N8N-CALLBACK-ERROR]", error);
        return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }
}
