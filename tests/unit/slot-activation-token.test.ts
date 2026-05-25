import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
    generateToken,
    createTokenForSlot,
    findActiveSlotByToken,
    touchPageSeen,
} from "@/services/slot-activation-token.service";

describe("slot-activation-token.service", () => {
    describe("generateToken", () => {
        it("produces URL-safe 12-char tokens", () => {
            const t = generateToken();
            expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
            expect(t.length).toBeGreaterThanOrEqual(11);
            expect(t.length).toBeLessThanOrEqual(16);
        });

        it("is unique across 10k generations", () => {
            const seen = new Set<string>();
            for (let i = 0; i < 10_000; i++) {
                seen.add(generateToken());
            }
            expect(seen.size).toBe(10_000);
        });
    });

    describe("createTokenForSlot", () => {
        it("persists a token with validUntil = slot.expiresAt", async () => {
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            const slot = { id: 42, expiresAt };
            const inserts: any[] = [];
            const db: any = {
                query: {
                    digitalCodeSlots: {
                        findFirst: async () => slot,
                    },
                },
                insert: () => ({
                    values: async (v: any) => {
                        inserts.push(v);
                    },
                }),
            };

            const res = await createTokenForSlot(db, 42);
            expect(res.token).toBeTruthy();
            expect(res.validUntil.getTime()).toBe(expiresAt.getTime());
            expect(inserts).toHaveLength(1);
            expect(inserts[0]).toMatchObject({ slotId: 42, token: res.token });
        });

        it("falls back to now + 30d when slot.expiresAt is null", async () => {
            const slot = { id: 1, expiresAt: null };
            const db: any = {
                query: {
                    digitalCodeSlots: { findFirst: async () => slot },
                },
                insert: () => ({ values: async () => {} }),
            };
            const before = Date.now();
            const res = await createTokenForSlot(db, 1);
            const diff = res.validUntil.getTime() - before;
            expect(diff).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
            expect(diff).toBeLessThan(31 * 24 * 60 * 60 * 1000);
        });

        it("throws when slot is not found", async () => {
            const db: any = {
                query: { digitalCodeSlots: { findFirst: async () => null } },
            };
            await expect(createTokenForSlot(db, 99)).rejects.toThrow(/not found/);
        });
    });

    describe("findActiveSlotByToken", () => {
        it("returns null when token is unknown", async () => {
            const db: any = {
                query: { slotActivationTokens: { findFirst: async () => null } },
            };
            const res = await findActiveSlotByToken(db, "nope");
            expect(res).toBeNull();
        });

        it("returns null when token is expired", async () => {
            const tokenRow = {
                token: "x",
                slotId: 1,
                validUntil: new Date(Date.now() - 1000),
            };
            const db: any = {
                query: { slotActivationTokens: { findFirst: async () => tokenRow } },
            };
            const res = await findActiveSlotByToken(db, "x");
            expect(res).toBeNull();
        });

        it("returns slot+account when token is valid", async () => {
            const tokenRow = {
                token: "ok",
                slotId: 1,
                validUntil: new Date(Date.now() + 1000),
            };
            const slot = { id: 1, digitalCodeId: 10 };
            const account = { id: 10, msAccountEmail: "x@y.com" };
            const db: any = {
                query: {
                    slotActivationTokens: { findFirst: async () => tokenRow },
                    digitalCodeSlots: { findFirst: async () => slot },
                    digitalCodes: { findFirst: async () => account },
                    slotLifecycle: { findFirst: async () => null },
                },
            };
            const res = await findActiveSlotByToken(db, "ok");
            expect(res?.slot.id).toBe(1);
            expect(res?.account.id).toBe(10);
            expect(res?.lifecycle).toBeNull();
        });

        it("returns null for empty / non-string tokens", async () => {
            const db: any = {};
            expect(await findActiveSlotByToken(db, "")).toBeNull();
            expect(await findActiveSlotByToken(db, null as any)).toBeNull();
        });
    });

    describe("touchPageSeen", () => {
        it("updates lastSeenAt for the given token", async () => {
            const updates: any[] = [];
            const db: any = {
                update: () => ({
                    set: (v: any) => ({
                        where: async (w: any) => {
                            updates.push({ v, w });
                        },
                    }),
                }),
            };
            await touchPageSeen(db, "tok");
            expect(updates).toHaveLength(1);
            expect(updates[0].v.lastSeenAt).toBeInstanceOf(Date);
        });

        it("is a no-op for empty token", async () => {
            const db: any = {
                update: () => {
                    throw new Error("should not be called");
                },
            };
            await expect(touchPageSeen(db, "")).resolves.toBeUndefined();
        });
    });
});
