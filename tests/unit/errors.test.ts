import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the logger so we can assert server-side capture without pulling the
// telegram/env chain that the real logger imports.
const errorSpy = vi.fn();
vi.mock("@/lib/logger", () => ({
    logger: {
        error: (...args: unknown[]) => errorSpy(...args),
        info: vi.fn(),
        warn: vi.fn(),
        critical: vi.fn(),
    },
}));

import { UserError, toClientError } from "@/lib/errors";

const GENERIC = "Une erreur est survenue. Veuillez réessayer.";

describe("UserError", () => {
    it("is an instanceof Error (compatible with existing catch blocks)", () => {
        expect(new UserError("x")).toBeInstanceOf(Error);
    });

    it("carries its message and a stable name", () => {
        const e = new UserError("Commande introuvable");
        expect(e.message).toBe("Commande introuvable");
        expect(e.name).toBe("UserError");
    });
});

describe("toClientError", () => {
    beforeEach(() => errorSpy.mockClear());

    it("passes a UserError message through unchanged (intentional, safe)", () => {
        expect(toClientError(new UserError("Stock insuffisant"))).toBe("Stock insuffisant");
    });

    it("does NOT log a UserError (it is an expected, user-facing outcome)", () => {
        toClientError(new UserError("Commande introuvable"));
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("genericizes a plain Error so DB/SQL internals never leak", () => {
        const msg = toClientError(new Error('column "balance" does not exist'));
        expect(msg).toBe(GENERIC);
        expect(msg).not.toContain("balance");
        expect(msg).not.toContain("column");
    });

    it("logs the real message server-side when genericizing", () => {
        toClientError(new Error('relation "orders" violates constraint'));
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith(
            'relation "orders" violates constraint',
            expect.objectContaining({ action: "ACTION_FAILED" }),
        );
    });

    it("genericizes a non-Error throw (string) and still logs", () => {
        expect(toClientError("boom")).toBe(GENERIC);
        expect(errorSpy).toHaveBeenCalledWith("boom", expect.objectContaining({ action: "ACTION_FAILED" }));
    });

    it("uses the provided action/userId context when logging", () => {
        toClientError(new Error("kaboom"), { action: "PAY_ORDER_FAILED", userId: 7 });
        expect(errorSpy).toHaveBeenCalledWith("kaboom", { action: "PAY_ORDER_FAILED", userId: 7 });
    });
});
