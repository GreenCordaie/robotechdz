import { notFound } from "next/navigation";
import { db } from "@/db";
import { findActiveSlotByToken } from "@/services/slot-activation-token.service";
import { enforceLocalDeviceQuota } from "@/services/slot-device-quota.service";
import { enforceDeviceQuota } from "@/services/loadbrain-device-quota.service";
import { isLbNetflixAuthoritative } from "@/lib/loadbrain-netflix-flag";
import { decrypt } from "@/lib/encryption";
import { ActivationClient } from "./ActivationClient";
import { productVariants, products, orderItems, orders, resellers } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Public, token-only deeplink page that streams the latest Netflix OTP or
 * household-update link to the customer in real time. No authentication.
 */
export default async function ActivationPage(props: { params: Promise<{ token: string }> }) {
    const { token } = await props.params;
    const resolved = await findActiveSlotByToken(db as any, token);

    if (!resolved) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-200 px-6">
                <div className="max-w-md text-center">
                    <div className="text-5xl mb-4">⛔</div>
                    <h1 className="text-2xl font-semibold mb-2">Lien invalide ou expiré</h1>
                    <p className="text-neutral-400">
                        Ce lien d&apos;activation n&apos;est plus actif. Contactez votre vendeur si vous pensez
                        qu&apos;il s&apos;agit d&apos;une erreur.
                    </p>
                </div>
            </main>
        );
    }

    const { slot, account } = resolved;

    // Device quota guard (Option C hybrid — anti link-sharing). Fail-closed: we
    // atomically secure a device session BEFORE decrypting and rendering creds.
    // When the slot is centralized on LoadBrain (lbSlotId set) AND authoritative
    // mode is on, LoadBrain is the single counter (P3-2); on a LoadBrain outage
    // we degrade to the local mirror cap. Otherwise the existing local path runs
    // unchanged: atomic guarded bump + TOCTOU recheck (a same-device debounce
    // race still has room and is allowed; only a genuinely exhausted quota is
    // blocked).
    const lbAuthoritative =
        slot.lbSlotId != null && (await isLbNetflixAuthoritative());
    const quota = lbAuthoritative
        ? await enforceDeviceQuota(db, slot)
        : await enforceLocalDeviceQuota(db, slot);
    if (!quota.ok) {
        return <DeviceLimitScreen max={quota.max ?? slot.maxDevices ?? 0} />;
    }

    // Decrypt credentials server-side (token gate already passed).
    // account.code is stored as "email | password" — expose ONLY the email to
    // the customer. The password must never reach the browser.
    const rawAccount = account.code ? decrypt(account.code) : null;
    const email = rawAccount ? rawAccount.split("|")[0].trim() : null;
    const pin = slot.code ? decrypt(slot.code) : null;

    // Resolve product brand name (e.g. "Netflix") — shown as the offer label.
    let brandName = "Streaming";
    try {
        const variant = await db.query.productVariants.findFirst({
            where: eq(productVariants.id, account.variantId),
            with: { product: true } as any,
        });
        if ((variant as any)?.product?.name) brandName = (variant as any).product.name;
        else if (variant?.name) brandName = variant.name;
    } catch {
        // brand stays default
    }

    // White-label: resolve the RESELLER who sold this slot and surface THEIR
    // brand to the end customer. slot -> order_item -> order -> reseller.
    // The operator stays invisible; falls back to neutral defaults if unset.
    let resellerBrand: string | null = null;
    let accentColor: string | null = null;
    let brandLogoUrl: string | null = null;
    let supportWhatsapp: string | null = null;
    let supportPhone: string | null = null;
    try {
        if (slot.orderItemId) {
            const [oi] = await db
                .select({ orderId: orderItems.orderId })
                .from(orderItems)
                .where(eq(orderItems.id, slot.orderItemId));
            if (oi?.orderId) {
                const [ord] = await db
                    .select({ resellerId: orders.resellerId })
                    .from(orders)
                    .where(eq(orders.id, oi.orderId));
                if (ord?.resellerId) {
                    const r = await db.query.resellers.findFirst({
                        where: eq(resellers.id, ord.resellerId),
                        columns: {
                            companyName: true,
                            brandName: true,
                            brandColor: true,
                            brandLogoUrl: true,
                            supportPhone: true,
                            supportWhatsapp: true,
                        },
                    });
                    if (r) {
                        resellerBrand = r.brandName?.trim() || r.companyName?.trim() || null;
                        accentColor = r.brandColor?.trim() || null;
                        brandLogoUrl = r.brandLogoUrl?.trim() || null;
                        supportWhatsapp = r.supportWhatsapp?.trim() || null;
                        supportPhone = r.supportPhone?.trim() || null;
                    }
                }
            }
        }
    } catch {
        // white-label is best-effort — never block activation on branding.
    }

    return (
        <ActivationClient
            token={token}
            brandName={brandName}
            resellerBrand={resellerBrand}
            accentColor={accentColor}
            brandLogoUrl={brandLogoUrl}
            supportWhatsapp={supportWhatsapp}
            supportPhone={supportPhone}
            email={email ?? "—"}
            profileName={slot.profileName ?? `Profil ${slot.slotNumber}`}
            pin={pin ?? ""}
            hasExtraMember={account.hasExtraMember === true}
            validUntil={resolved.tokenRow.validUntil.toISOString()}
        />
    );
}

function DeviceLimitScreen({ max }: { max: number }) {
    return (
        <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-200 px-6">
            <div className="max-w-md text-center">
                <div className="text-5xl mb-4">📵</div>
                <h1 className="text-2xl font-semibold mb-2">Limite d&apos;appareils atteinte</h1>
                <p className="text-neutral-400">
                    Vous avez activé {max} appareil{max > 1 ? "s" : ""} avec ce
                    lien — c&apos;est le maximum prévu pour votre abonnement.
                    Pour activer un appareil supplémentaire, contactez votre vendeur.
                </p>
            </div>
        </main>
    );
}
