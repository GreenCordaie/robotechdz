/**
 * LoadBrain sale-allocation orchestrator (P2-1).
 *
 * Allocates shared-streaming profile slots for ONE order item by delegating to
 * LoadBrain (the system-of-record for shared Netflix accounts). LoadBrain claims
 * AVAILABLE *imported* slots atomically; this module then resolves the matching
 * LOCAL mirror slot and flips it VENDU so the boutique's delivery/SSE paths keep
 * working unchanged.
 *
 * NOT yet wired into the sale path — `allocateOrderStock` still does a local
 * pick. P2-2 threads the real customer + flips the gate behind
 * LB_NETFLIX_AUTHORITATIVE. This file is a standalone, injectable unit.
 *
 * Design invariants:
 *  - FAIL-CLOSED: every LoadBrain failure (LB_UNAVAILABLE / OUT_OF_STOCK)
 *    propagates as a typed `LbAllocError`. We NEVER fall back to a local pick
 *    here — silently double-selling a slot when LoadBrain is unreachable is the
 *    exact bug this whole phase exists to prevent. The PENDING/fallback decision
 *    belongs to the caller (P2-3).
 *  - Per-unit idempotency: `externalOrderRef = `${orderItemId}-${unitIndex}``.
 *    LoadBrain is idempotent on (siteId, externalOrderRef); a distinct ref per
 *    unit means a retried multi-quantity allocation can't collide two units onto
 *    one ref.
 *  - Resolve-by-token: an AVAILABLE imported slot's LoadBrain `public_token`
 *    equals the boutique's original activation token. So after allocate we map
 *    `slotActivationTokens.token === result.publicToken` → local slot id. A token
 *    that resolves to nothing is a data gap (MIRROR_RESOLVE_FAILED), never a
 *    silent skip.
 *  - All mirror writes run in the passed `tx`. A later throw (e.g. unit 2 fails
 *    after unit 1 succeeded) rolls back unit 1's VENDU with the rest of the
 *    transaction.
 */
import { eq, and, sql } from "drizzle-orm";
import { digitalCodes, digitalCodeSlots, slotActivationTokens } from "@/db/schema";
import { DigitalCodeStatus, DigitalCodeSlotStatus } from "@/lib/constants";
import { allocateSlot as defaultAllocateSlot, LbNetflixError } from "@/services/loadbrain-netflix.client";
import type { AllocateSlotInput, AllocateSlotResult } from "@/services/loadbrain-netflix.client";

export type LbAllocErrorCode =
    | "NO_LB_ACCOUNT"
    | "OUT_OF_STOCK"
    | "LB_UNAVAILABLE"
    | "MIRROR_RESOLVE_FAILED";

export class LbAllocError extends Error {
    constructor(
        public readonly code: LbAllocErrorCode,
        message?: string,
    ) {
        super(message ?? code);
        this.name = "LbAllocError";
    }
}

/** Minimal shape the orchestrator needs off an order item. */
export interface SharingAllocItem {
    /** orderItemId — the per-unit externalOrderRef base. */
    id: number;
    variantId: number;
    quantity: number;
    customer?: {
        phone?: string | null;
        name?: string | null;
        email?: string | null;
    };
}

export interface AllocatedSlot {
    localSlotId: number;
    lbSlotId: string;
    publicToken: string;
    profileName?: string;
}

export interface LbAllocResult {
    slots: AllocatedSlot[];
}

export interface LbAllocDeps {
    /** Injectable LoadBrain client (tests pass a mock). */
    allocateFn?: (input: AllocateSlotInput) => Promise<AllocateSlotResult>;
    /** Site id; defaults to LOADBRAIN_SITE_ID env (AGENT007). */
    siteId?: string;
    /** Reserved for future read paths; mirror reads/writes use `tx`. */
    db?: unknown;
}

/**
 * Placeholder E.164 used when the order item carries no customer phone at this
 * layer. P2-2 threads the real customer phone through; until then LoadBrain
 * still needs a syntactically valid number for the magic-link recipient.
 * Clearly fake (Algeria mobile range, all-zero subscriber) so it's greppable.
 */
const PLACEHOLDER_PHONE = "+213000000000";

function resolveSiteId(deps: LbAllocDeps): string {
    const siteId = deps.siteId ?? process.env.LOADBRAIN_SITE_ID;
    if (!siteId) {
        throw new LbAllocError("LB_UNAVAILABLE", "LOADBRAIN_SITE_ID unset");
    }
    return siteId;
}

/**
 * Allocate `item.quantity` shared-streaming slots for `item` via LoadBrain and
 * flip the matching local mirror slots VENDU. See file header for invariants.
 *
 * @throws {LbAllocError} NO_LB_ACCOUNT | OUT_OF_STOCK | LB_UNAVAILABLE | MIRROR_RESOLVE_FAILED
 */
export async function allocateSharingItemViaLoadBrain(
    tx: any,
    item: SharingAllocItem,
    deps: LbAllocDeps = {},
): Promise<LbAllocResult> {
    const allocateFn = deps.allocateFn ?? defaultAllocateSlot;
    const siteId = resolveSiteId(deps);

    // 1. Resolve a local digital_codes row (the LoadBrain account anchor) for
    //    this variant that is DISPONIBLE *and* migrated to LoadBrain
    //    (lbAccountId NOT NULL). FOR UPDATE so concurrent sales don't race onto
    //    the same account row. If no migrated account exists, the variant isn't
    //    on LoadBrain yet — caller decides (NO_LB_ACCOUNT).
    const accountRows = await tx
        .select({
            id: digitalCodes.id,
            lbAccountId: digitalCodes.lbAccountId,
        })
        .from(digitalCodes)
        .where(
            and(
                eq(digitalCodes.variantId, item.variantId),
                eq(digitalCodes.status, DigitalCodeStatus.DISPONIBLE),
                sql`${digitalCodes.lbAccountId} IS NOT NULL`,
            ),
        )
        .limit(1)
        .for("update");

    const account = accountRows[0];
    if (!account || !account.lbAccountId) {
        throw new LbAllocError(
            "NO_LB_ACCOUNT",
            `no LoadBrain-migrated digital_code for variant ${item.variantId}`,
        );
    }

    const customerPhone = item.customer?.phone?.trim() || PLACEHOLDER_PHONE;
    const customerName = item.customer?.name ?? undefined;
    const customerEmail = item.customer?.email ?? undefined;

    const slots: AllocatedSlot[] = [];

    for (let i = 0; i < item.quantity; i++) {
        // 2. Claim one slot from LoadBrain. Per-unit ref → idempotent + no
        //    cross-unit collision. allocateFn throws LbNetflixError on failure.
        let result: AllocateSlotResult;
        try {
            result = await allocateFn({
                siteId,
                accountId: account.lbAccountId,
                externalOrderRef: `${item.id}-${i}`,
                customerPhone,
                customerName,
                customerEmail,
            });
        } catch (err: unknown) {
            // FAIL-CLOSED: translate the client's typed error into our domain
            // error. Never fall back to a local pick here.
            if (err instanceof LbNetflixError) {
                if (err.code === "OUT_OF_STOCK") {
                    throw new LbAllocError("OUT_OF_STOCK", err.message);
                }
                // LB_UNAVAILABLE | BAD_REQUEST | LB_ERROR all collapse to
                // "LoadBrain didn't give us a slot" → fail closed.
                throw new LbAllocError("LB_UNAVAILABLE", err.message);
            }
            throw new LbAllocError("LB_UNAVAILABLE", err instanceof Error ? err.message : String(err));
        }

        // 3. Map the LoadBrain public_token back to the LOCAL mirror slot. The
        //    AVAILABLE imported slot's public_token == the boutique's original
        //    activation token, so slot_activation_tokens.token resolves it.
        const tokenRow = await tx.query.slotActivationTokens.findFirst({
            where: eq(slotActivationTokens.token, result.publicToken),
            columns: { slotId: true },
        });
        const localSlotId: number | undefined = tokenRow?.slotId;
        if (!localSlotId) {
            // Data gap: LoadBrain handed us a token we can't mirror locally.
            // Throwing rolls back any earlier VENDU in this tx.
            throw new LbAllocError(
                "MIRROR_RESOLVE_FAILED",
                `public_token ${result.publicToken} did not resolve to a local slot`,
            );
        }

        // 4. Flip the local mirror slot VENDU and stamp the LoadBrain slot id.
        //    activationUrl/token already exist on the imported slot.
        await tx
            .update(digitalCodeSlots)
            .set({
                status: DigitalCodeSlotStatus.VENDU,
                orderItemId: item.id,
                lbSlotId: result.slotId,
            })
            .where(eq(digitalCodeSlots.id, localSlotId));

        slots.push({
            localSlotId,
            lbSlotId: result.slotId,
            publicToken: result.publicToken,
            profileName: result.netflixProfileName,
        });
    }

    return { slots };
}
