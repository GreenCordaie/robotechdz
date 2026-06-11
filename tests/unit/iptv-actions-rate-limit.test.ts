import { describe, it, expect, beforeEach } from "vitest";
import {
    checkActionGuard,
    ACTION_COOLDOWN_MS,
    __resetActionGuardForTests,
} from "@/app/reseller/iptv/rate-limit";

describe("checkActionGuard", () => {
    beforeEach(() => {
        __resetActionGuardForTests();
    });

    it("allows the first call for a key", () => {
        const r = checkActionGuard("r1:line1:enable");
        expect(r.ok).toBe(true);
    });

    it("blocks the second call within the cooldown window", () => {
        const first = checkActionGuard("r1:line1:enable");
        expect(first.ok).toBe(true);
        const second = checkActionGuard("r1:line1:enable");
        expect(second.ok).toBe(false);
        if (!second.ok) {
            expect(second.error).toMatch(/déjà en cours/);
        }
    });

    it("allows the call again after the cooldown elapses", async () => {
        checkActionGuard("r1:line1:enable");
        // Advance virtual time by manipulating Date.now — easier: just wait.
        await new Promise((r) => setTimeout(r, ACTION_COOLDOWN_MS + 50));
        const after = checkActionGuard("r1:line1:enable");
        expect(after.ok).toBe(true);
    });

    it("isolates keys (different reseller / line / action)", () => {
        expect(checkActionGuard("r1:line1:enable").ok).toBe(true);
        // Different reseller for same line+action -> own bucket.
        expect(checkActionGuard("r2:line1:enable").ok).toBe(true);
        // Different line for same reseller -> own bucket.
        expect(checkActionGuard("r1:line2:enable").ok).toBe(true);
        // Different action for same reseller+line -> own bucket.
        expect(checkActionGuard("r1:line1:disable").ok).toBe(true);
        // But the original combination is still locked.
        expect(checkActionGuard("r1:line1:enable").ok).toBe(false);
    });
});
