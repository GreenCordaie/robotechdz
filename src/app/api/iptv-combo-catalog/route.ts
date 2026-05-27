import { NextResponse } from "next/server";
import { db } from "@/db";
import { productVariants, products } from "@/db/schema";
import { isNotNull, eq, and, gt } from "drizzle-orm";
import { getSession } from "@/lib/auth";

interface LoadBrainProduct {
    productId: string;
    providerId?: string;
    providerName?: string;
    planId?: string;
    planDurationDays?: number;
}

export async function GET() {
    // Exposes internal LoadBrain provider/plan IDs — require a session.
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Get all IPTV variants in ROBOTECH DB (loadbrain_slug present, > 0 DZD, kiosk_visible)
    const rows = await db
        .select({
            variantId: productVariants.id,
            productName: products.name,
            variantName: productVariants.name,
            slug: productVariants.loadbrainSlug,
            price: productVariants.salePriceDzd,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(
            and(
                isNotNull(productVariants.loadbrainSlug),
                gt(productVariants.salePriceDzd, "0"),
                eq(productVariants.kioskVisible, true),
            ),
        );

    // Filter out ibo-* (Ibosol items can't be combo'd with themselves)
    const iptvOnly = rows.filter((r) => r.slug && !r.slug.startsWith("ibo-"));

    // Cross-reference with LoadBrain site/products to get providerId, planId, providerName, durationDays
    let lbProductsMap = new Map<string, LoadBrainProduct>();
    try {
        if (process.env.LOADBRAIN_URL && process.env.LOADBRAIN_API_KEY) {
            const res = await fetch(`${process.env.LOADBRAIN_URL}/api/v1/site/products`, {
                headers: { "X-API-Key": process.env.LOADBRAIN_API_KEY },
                cache: "no-store",
            });
            const lbProducts = await res.json();
            const list: LoadBrainProduct[] = lbProducts?.data?.products || [];
            lbProductsMap = new Map(list.map((p) => [p.productId, p]));
        }
    } catch (err) {
        console.error("[iptv-combo-catalog] LoadBrain fetch failed:", err);
    }

    const plans = iptvOnly
        .map((p) => {
            const lb = lbProductsMap.get(p.slug!);
            if (!lb) return null;
            return {
                variantId: p.variantId,
                providerId: lb.providerId || "",
                providerName: lb.providerName || "IPTV",
                planId: lb.planId || "",
                productName: `${p.productName} ${p.variantName}`,
                durationDays: lb.planDurationDays || 0,
                price: p.price,
            };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

    return NextResponse.json({ plans });
}
