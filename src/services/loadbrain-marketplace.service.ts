import "server-only";
import { db } from "@/db";
import { products, productVariants, categories } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { lbClient, isLoadBrainEnabled } from "@/lib/loadbrain";

/**
 * LoadBrain Marketplace — exposer les services LoadBrain dans le dashboard admin
 * pour les "linker" à des products + variants vendables.
 *
 * Une fois liés, un variant porte un `loadbrainSlug` → le checkout reseller
 * (déjà câblé en EPIC 1/2) déclenchera le provisioning automatique via webhook.
 *
 * IMPORTANT — Pas de credit consommé :
 *   - listProducts() de LoadBrain est une lecture (pas de provision)
 *   - Si LOADBRAIN_API_KEY absent (dev/test), on retourne des fixtures statiques
 *   - L'admin DÉCIDE quels services exposer + à quel prix
 */

export interface LoadBrainService {
    slug: string;             // identifiant LoadBrain (ex: "iptv-12m", "ironmax-1m", "ibo-yearly")
    displayName: string;      // nom commercial
    providerName: string;     // ex: "AtlasPro", "IronMax", "Panel King 365"
    providerType: "iptv" | "ibosol" | "other";
    durationLabel: string;    // ex: "1 mois", "12 mois", "Lifetime"
    deliveryType: "credentials" | "code" | "playlist";
    purchasePriceUsd: number; // prix d'achat LoadBrain en USD (informatif)
    isAlreadyLinked: boolean; // déjà mappé à un variant local ?
    linkedVariantIds: number[]; // variant(s) qui pointent ce slug
}

const FIXTURE_SERVICES: Omit<LoadBrainService, "isAlreadyLinked" | "linkedVariantIds">[] = [
    {
        slug: "atlaspro-1m",
        displayName: "AtlasPro IPTV — 1 mois",
        providerName: "AtlasPro",
        providerType: "iptv",
        durationLabel: "1 mois",
        deliveryType: "credentials",
        purchasePriceUsd: 4.5,
    },
    {
        slug: "atlaspro-3m",
        displayName: "AtlasPro IPTV — 3 mois",
        providerName: "AtlasPro",
        providerType: "iptv",
        durationLabel: "3 mois",
        deliveryType: "credentials",
        purchasePriceUsd: 11.0,
    },
    {
        slug: "atlaspro-12m",
        displayName: "AtlasPro IPTV — 12 mois",
        providerName: "AtlasPro",
        providerType: "iptv",
        durationLabel: "12 mois",
        deliveryType: "credentials",
        purchasePriceUsd: 32.0,
    },
    {
        slug: "ironmax-1m",
        displayName: "IronMax IPTV — 1 mois",
        providerName: "IronMax",
        providerType: "iptv",
        durationLabel: "1 mois",
        deliveryType: "code",
        purchasePriceUsd: 5.0,
    },
    {
        slug: "ironmax-12m",
        displayName: "IronMax IPTV — 12 mois",
        providerName: "IronMax",
        providerType: "iptv",
        durationLabel: "12 mois",
        deliveryType: "code",
        purchasePriceUsd: 35.0,
    },
    {
        slug: "panelking365-1m",
        displayName: "PanelKing365 IPTV — 1 mois",
        providerName: "Panel King 365",
        providerType: "iptv",
        durationLabel: "1 mois",
        deliveryType: "credentials",
        purchasePriceUsd: 4.0,
    },
    {
        slug: "ibo-activate-yearly",
        displayName: "IBO Player — Activation 1 an (par MAC)",
        providerName: "IBOSOL",
        providerType: "ibosol",
        durationLabel: "1 an",
        deliveryType: "playlist",
        purchasePriceUsd: 6.5,
    },
    {
        slug: "ibo-activate-lifetime",
        displayName: "IBO Player — Activation Lifetime (par MAC)",
        providerName: "IBOSOL",
        providerType: "ibosol",
        durationLabel: "Lifetime",
        deliveryType: "playlist",
        purchasePriceUsd: 18.0,
    },
];

export class LoadBrainMarketplaceService {
    /**
     * Liste les services disponibles, en marquant ceux déjà liés à des variants.
     * En dev/test (LOADBRAIN_API_KEY absent) : retourne des fixtures.
     */
    static async listAvailableServices(): Promise<LoadBrainService[]> {
        const allLinkedVariants = await db
            .select({
                id: productVariants.id,
                slug: productVariants.loadbrainSlug,
            })
            .from(productVariants);

        const linkedBySlug = new Map<string, number[]>();
        for (const v of allLinkedVariants) {
            if (!v.slug) continue;
            const arr = linkedBySlug.get(v.slug) ?? [];
            arr.push(v.id);
            linkedBySlug.set(v.slug, arr);
        }

        let baseServices: Omit<LoadBrainService, "isAlreadyLinked" | "linkedVariantIds">[] = [];

        if (isLoadBrainEnabled() && lbClient) {
            try {
                const products = await lbClient.listProducts();
                const items = (products as { products?: unknown[] })?.products ?? [];
                baseServices = items.map((p) => mapLoadBrainProduct(p));
            } catch (err) {
                console.error("[loadbrain-marketplace] Failed to list products:", err);
                baseServices = FIXTURE_SERVICES;
            }
        } else {
            baseServices = FIXTURE_SERVICES;
        }

        return baseServices.map((s) => ({
            ...s,
            isAlreadyLinked: linkedBySlug.has(s.slug),
            linkedVariantIds: linkedBySlug.get(s.slug) ?? [],
        }));
    }

    /**
     * Lier un service LoadBrain à un nouveau product + variant en local.
     * Le slug devient le pivot pour le provisioning automatique au checkout.
     */
    static async linkServiceToProduct(input: {
        slug: string;
        productName: string;
        productDescription?: string;
        categoryId: number;
        salePriceDzd: string;
        resellerPriceOverrideDzd?: string;
        variantName: string;
        kioskVisible?: boolean;
        resellerVisible?: boolean;
    }): Promise<{ success: true; productId: number; variantId: number } | { success: false; error: string }> {
        // Refuse si déjà mappé (sauf si l'admin veut un 2e variant — on permet, mais on signale)
        const existing = await db
            .select({ id: productVariants.id })
            .from(productVariants)
            .where(eq(productVariants.loadbrainSlug, input.slug));

        if (existing.length > 0) {
            console.warn(
                `[loadbrain-marketplace] slug "${input.slug}" déjà lié à variant(s) ${existing
                    .map((v) => v.id)
                    .join(", ")} — création d'un variant supplémentaire autorisée`
            );
        }

        // Vérifie que la catégorie existe
        const cat = await db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.id, input.categoryId));
        if (cat.length === 0) return { success: false, error: "Catégorie introuvable" };

        try {
            const [newProduct] = await db
                .insert(products)
                .values({
                    name: input.productName,
                    description: input.productDescription ?? null,
                    categoryId: input.categoryId,
                    isManualDelivery: false,
                    requiresPlayerId: false,
                    status: "ACTIVE",
                })
                .returning();

            const [newVariant] = await db
                .insert(productVariants)
                .values({
                    productId: newProduct.id,
                    name: input.variantName,
                    salePriceDzd: input.salePriceDzd,
                    resellerPriceOverrideDzd: input.resellerPriceOverrideDzd ?? null,
                    kioskVisible: input.kioskVisible ?? false,
                    resellerVisible: input.resellerVisible ?? true,
                    loadbrainSlug: input.slug,
                    isSharing: false,
                    totalSlots: 1,
                })
                .returning();

            return { success: true, productId: newProduct.id, variantId: newVariant.id };
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erreur inconnue";
            console.error("[loadbrain-marketplace] linkServiceToProduct failed:", msg);
            return { success: false, error: msg };
        }
    }

    /**
     * Déconnecte un slug d'un variant (le rend "manuel" sans toucher au stock).
     * Note : ne supprime pas le product/variant — juste détache le slug.
     */
    static async unlinkSlugFromVariant(variantId: number): Promise<{ success: boolean; error?: string }> {
        try {
            await db
                .update(productVariants)
                .set({ loadbrainSlug: null })
                .where(eq(productVariants.id, variantId));
            return { success: true };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : "Erreur inconnue" };
        }
    }
}

function mapLoadBrainProduct(p: unknown): Omit<LoadBrainService, "isAlreadyLinked" | "linkedVariantIds"> {
    const obj = p as Record<string, unknown>;
    const slug = String(obj.productId ?? obj.slug ?? "");
    const displayName = String(obj.displayName ?? obj.name ?? slug);

    let providerType: LoadBrainService["providerType"] = "other";
    if (slug.startsWith("ibo-")) providerType = "ibosol";
    else if (
        slug.startsWith("atlaspro") ||
        slug.startsWith("ironmax") ||
        slug.startsWith("panelking") ||
        slug.includes("iptv")
    )
        providerType = "iptv";

    return {
        slug,
        displayName,
        providerName: String(obj.providerName ?? "LoadBrain"),
        providerType,
        durationLabel: String(obj.durationLabel ?? "—"),
        deliveryType: (obj.deliveryType as LoadBrainService["deliveryType"]) ?? "credentials",
        purchasePriceUsd: typeof obj.purchasePriceUsd === "number" ? obj.purchasePriceUsd : 0,
    };
}
