import { notFound } from "next/navigation";
import { db } from "@/db";
import { findActiveSlotByToken } from "@/services/slot-activation-token.service";
import { decrypt } from "@/lib/encryption";
import { ActivationClient } from "./ActivationClient";
import { productVariants, products } from "@/db/schema";
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

    // Decrypt credentials server-side (token gate already passed)
    const email = account.code ? decrypt(account.code) : null;
    const password = account.outlookPassword ? decrypt(account.outlookPassword) : null;
    const pin = slot.code ? decrypt(slot.code) : null;

    // Resolve brand name
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

    return (
        <ActivationClient
            token={token}
            brandName={brandName}
            email={email ?? "—"}
            password={password ?? ""}
            profileName={slot.profileName ?? `Profil ${slot.slotNumber}`}
            pin={pin ?? ""}
            hasExtraMember={account.hasExtraMember === true}
            validUntil={resolved.tokenRow.validUntil.toISOString()}
        />
    );
}
