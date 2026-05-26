import { describe, it, expect } from "vitest";
import { buildGameWonSnapshot, prettifyGameCode } from "@/app/reseller/shop/game-snapshot";

describe("prettifyGameCode", () => {
    it("turns a snake_case code into a Title Case label", () => {
        expect(prettifyGameCode("freefire_global")).toBe("Freefire Global");
        expect(prettifyGameCode("pubgm")).toBe("Pubgm");
    });
});

describe("buildGameWonSnapshot", () => {
    it("builds a title from game + package and reads playerName from userid", () => {
        const snap = buildGameWonSnapshot({
            gameCode: "freefire_global",
            catalogueId: 2055,
            packageName: "110",
            player: { userid: "2040376982" },
            lb: { orderId: "x1" },
        });
        expect(snap.kind).toBe("game");
        expect(snap.title).toBe("Freefire Global · 110");
        expect(snap.playerName).toBe("2040376982");
        expect(snap.catalogueId).toBe(2055);
        expect(snap.lb).toEqual({ orderId: "x1" });
    });
    it("falls back to the first player value when userid is absent", () => {
        const snap = buildGameWonSnapshot({ gameCode: "genshin", catalogueId: 1, packageName: "60", player: { serverid: "Asia" } });
        expect(snap.playerName).toBe("Asia");
    });
    it("playerName is null when player is empty", () => {
        const snap = buildGameWonSnapshot({ gameCode: "x", catalogueId: 1, packageName: "p", player: {} });
        expect(snap.playerName).toBeNull();
    });
});
