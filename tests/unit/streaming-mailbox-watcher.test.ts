import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/encryption", () => ({
    encrypt: (s: string) => `enc(${s})`,
    decrypt: (s: string) => s.replace(/^enc\(/, "").replace(/\)$/, ""),
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/services/netflix-resolver.service", () => ({
    NetflixResolverService: {
        resolve: vi.fn(async () => ({ type: "NOT_FOUND", attempts: 0 })),
    },
}));

import {
    computeIntensity,
    shouldPoll,
    routeEvent,
    persistEvent,
    pollAccount,
    __forTests,
} from "@/workers/streaming-mailbox-watcher.worker";

const now = new Date("2026-05-25T12:00:00Z");

function slot(overrides: Partial<any> = {}) {
    return {
        id: 1,
        activeTokenLastSeenAt: null,
        soldAt: null,
        lifecycle: null,
        ...overrides,
    };
}

describe("computeIntensity", () => {
    it("HIGH when a slot was seen in the last 10 min", () => {
        const seen = new Date(now.getTime() - 60_000);
        expect(computeIntensity(now, [slot({ activeTokenLastSeenAt: seen })])).toBe("HIGH");
    });

    it("HIGH when household update is expected within ±7 days", () => {
        const expected = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        const s = slot({ lifecycle: { nextHouseholdExpectedAt: expected } });
        expect(computeIntensity(now, [s])).toBe("HIGH");
    });

    it("NORMAL when a slot was sold in the last 24h but no recent view", () => {
        const sold = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        expect(computeIntensity(now, [slot({ soldAt: sold })])).toBe("NORMAL");
    });

    it("LOW when nothing recent is happening", () => {
        const old = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        expect(computeIntensity(now, [slot({ soldAt: old })])).toBe("LOW");
    });
});

describe("shouldPoll", () => {
    it("polls immediately when never polled", () => {
        expect(shouldPoll("NORMAL", null, now)).toBe(true);
    });
    it("HIGH polls every 30s", () => {
        const last = new Date(now.getTime() - 31_000);
        expect(shouldPoll("HIGH", last, now)).toBe(true);
        const recent = new Date(now.getTime() - 10_000);
        expect(shouldPoll("HIGH", recent, now)).toBe(false);
    });
    it("LOW polls every 30m", () => {
        const last = new Date(now.getTime() - 10 * 60 * 1000);
        expect(shouldPoll("LOW", last, now)).toBe(false);
    });
});

describe("routeEvent", () => {
    it("OTP_CODE picks the most recently seen slot", () => {
        const t1 = new Date(now.getTime() - 60_000);
        const t2 = new Date(now.getTime() - 30_000);
        const slots = [
            slot({ id: 1, activeTokenLastSeenAt: t1 }),
            slot({ id: 2, activeTokenLastSeenAt: t2 }),
        ];
        const r = routeEvent("OTP_CODE", now, slots);
        expect(r.slotIds).toEqual([2]);
    });

    it("OTP_CODE returns empty when no slot is active", () => {
        const r = routeEvent("OTP_CODE", now, [slot(), slot({ id: 2 })]);
        expect(r.slotIds).toEqual([]);
    });

    it("HOUSEHOLD_LINK broadcasts to all slots", () => {
        const slots = [slot({ id: 1 }), slot({ id: 2 }), slot({ id: 3 })];
        const r = routeEvent("HOUSEHOLD_LINK", now, slots);
        expect(r.slotIds.sort()).toEqual([1, 2, 3]);
    });
});

describe("persistEvent dedup", () => {
    function makeDb(initial: any[] = []) {
        const rows = [...initial];
        let nextId = 100;
        return {
            rows,
            query: {
                slotEvents: {
                    findFirst: async (opts: any) => rows.find((r) => r.sourceEmailId && opts) ?? null,
                },
            },
            insert: () => ({
                values: (v: any) => ({
                    returning: async () => {
                        const id = nextId++;
                        rows.push({ id, ...v });
                        return [{ id }];
                    },
                }),
            }),
        } as any;
    }

    it("inserts a new event", async () => {
        const db = makeDb();
        const res = await persistEvent(db, {
            digitalCodeId: 1,
            slotId: 2,
            eventType: "OTP_CODE",
            value: "1234",
            sourceEmailId: "msg-a",
        });
        expect(res.inserted).toBe(true);
        expect(db.rows).toHaveLength(1);
    });

    it("skips duplicate (same digital_code_id + source_email_id)", async () => {
        const db = makeDb([{ id: 1, digitalCodeId: 1, sourceEmailId: "msg-a" }]);
        const res = await persistEvent(db, {
            digitalCodeId: 1,
            slotId: 2,
            eventType: "OTP_CODE",
            value: "1234",
            sourceEmailId: "msg-a",
        });
        expect(res.inserted).toBe(false);
    });
});

describe("pollAccount integration", () => {
    function makeDb(opts: { account: any; slots: any[]; tokens?: any[]; lifecycle?: any[] }) {
        const tokens = opts.tokens ?? [];
        const lifecycle = opts.lifecycle ?? [];
        const events: any[] = [];
        const updates: any[] = [];
        let nextId = 1;
        return {
            events,
            updates,
            query: {
                digitalCodes: { findFirst: async () => opts.account },
                digitalCodeSlots: { findMany: async () => opts.slots },
                slotActivationTokens: { findMany: async () => tokens },
                slotLifecycle: { findMany: async () => lifecycle, findFirst: async () => null },
                slotEvents: { findFirst: async () => null },
            },
            update: () => ({
                set: (v: any) => ({
                    where: async () => {
                        updates.push(v);
                    },
                }),
            }),
            insert: () => ({
                values: (v: any) => {
                    events.push({ id: nextId++, ...v });
                    return {
                        returning: async () => [{ id: events.length }],
                    };
                },
            }),
        } as any;
    }

    it("creates an OTP event routed to the active slot", async () => {
        const seen = new Date(Date.now() - 30_000);
        const db = makeDb({
            account: {
                id: 10,
                msStatus: "CONNECTED",
                msRefreshToken: "tok",
                msAccountEmail: "x@y.com",
                msClientId: null,
                msLastSync: null,
            },
            slots: [{ id: 1, digitalCodeId: 10, status: "VENDU", createdAt: seen }],
            tokens: [{ slotId: 1, lastSeenAt: seen }],
        });
        const broadcasts: any[] = [];
        const res = await pollAccount(db, 10, {
            resolveEmail: async () => ({
                type: "CODE",
                value: "1234",
                sourceEmailId: "email-1",
            }),
            broadcast: (codeId, ids, evt) => broadcasts.push({ codeId, ids, evt }),
        });
        expect(res.polled).toBe(true);
        expect(res.eventsCreated).toBe(1);
        expect(broadcasts).toHaveLength(1);
        expect(broadcasts[0].ids).toEqual([1]);
        expect(broadcasts[0].evt.type).toBe("OTP_CODE");
    });

    it("broadcasts HOUSEHOLD_LINK to every slot of the account", async () => {
        const db = makeDb({
            account: {
                id: 10,
                msStatus: "CONNECTED",
                msRefreshToken: "tok",
                msAccountEmail: "x@y.com",
                msClientId: null,
                msLastSync: null,
            },
            slots: [
                { id: 1, digitalCodeId: 10, status: "VENDU", createdAt: new Date() },
                { id: 2, digitalCodeId: 10, status: "VENDU", createdAt: new Date() },
                { id: 3, digitalCodeId: 10, status: "VENDU", createdAt: new Date() },
            ],
        });
        const broadcasts: any[] = [];
        const res = await pollAccount(db, 10, {
            resolveEmail: async () => ({
                type: "LINK",
                value: "https://netflix.com/...",
                sourceEmailId: "h-1",
            }),
            broadcast: (codeId, ids, evt) => broadcasts.push({ ids, evt }),
        });
        expect(res.eventsCreated).toBe(3);
        expect(broadcasts[0].ids.sort()).toEqual([1, 2, 3]);
        expect(broadcasts[0].evt.type).toBe("HOUSEHOLD_LINK");
    });

    it("skips polling when account is not CONNECTED", async () => {
        const db = makeDb({
            account: { id: 10, msStatus: "EXPIRED", msRefreshToken: null },
            slots: [],
        });
        const res = await pollAccount(db, 10);
        expect(res.polled).toBe(false);
    });
});
