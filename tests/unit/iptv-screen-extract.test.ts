import { describe, it, expect } from "vitest";
import {
    extractScreen,
    isUpstreamCompleted,
    parsePlanDurationDays,
} from "@/lib/iptv-screen";

/**
 * Covers the reseller IPTV "4 bugs" reported by the chef on the trial line
 * (ID 7, IronMax) — see STATUS.md 2026-05-28 19:50. The live LoadBrain stack
 * isn't reachable in CI, so we validate the consumer mapping against the exact
 * payload values the chef documented as "green upstream".
 */

const CHEF_USERNAME = "99994342114470433444"; // 20 digits — must not lose the last one
const CHEF_PASSWORD = "2895701349247247";

describe("extractScreen — wrapper traversal (bugs 2 & 3)", () => {
    it("reads screens[0] under task.credentials (canonical shape)", () => {
        const task = {
            id: "t_7",
            status: "completed",
            credentials: {
                screens: [
                    {
                        username: CHEF_USERNAME,
                        password: CHEF_PASSWORD,
                        m3uUrl: "http://lg.stir.wales:8080/get.php?username=x&password=y&type=m3u_plus",
                        epgUrl: "http://lg.stir.wales:8080/xmltv.php",
                        code: "ABC123",
                    },
                ],
            },
        };
        const s = extractScreen(task);
        expect(s.username).toBe(CHEF_USERNAME); // full 20 digits, no truncation
        expect(s.password).toBe(CHEF_PASSWORD); // not empty
        expect(s.m3uUrl).toContain("lg.stir.wales:8080");
        expect(s.code).toBe("ABC123");
    });

    it("finds screens[0] even when nested under result/data/task/order wrappers", () => {
        // task wrapper = provision.tasks.get ; order wrapper = provision.orders.get
        // (atlaspro/panelking reach the line via lb_order_id).
        for (const key of ["result", "data", "task", "order"] as const) {
            const payload = {
                status: "completed",
                [key]: { credentials: { screens: [{ username: "u", password: "p" }] } },
            };
            const s = extractScreen(payload);
            expect(s.username).toBe("u");
            expect(s.password).toBe("p");
        }
    });

    it("parses the REAL atlaspro task payload (STATUS 20:20 / task 04316f29)", () => {
        // Exact shape the SDK delivers: transport strips the `{success,data}`
        // envelope (transport.js returns parsed.data), so tasks.get yields
        // `{ task: { credentials: { screens: [...] } } }`.
        const sdkReturn = {
            task: {
                id: "04316f29-0a3f-4df2-9b39-01f405d2bfa3",
                status: "completed",
                credentials: {
                    screens: [
                        {
                            screenNumber: 1,
                            username: "365332146332404",
                            password: "1593574628",
                            m3uUrl: "http://15rof.site:80/get.php?username=365332146332404&password=1593574628&type=m3u&output=ts",
                            epgUrl: "http://15rof.site:80/xmltv.php?username=365332146332404&password=1593574628",
                            expiresAt: "2026-05-30T14:54:12.022Z",
                        },
                    ],
                },
            },
        };
        const s = extractScreen(sdkReturn);
        expect(s.username).toBe("365332146332404");
        expect(s.password).toBe("1593574628");
        expect(s.m3uUrl).toContain("get.php");
        expect(s.epgUrl).toContain("xmltv.php");
        expect(s.expiresAt).toBe("2026-05-30T14:54:12.022Z");
    });

    it("survives an extra gateway wrapper (data.task / result.task nesting)", () => {
        // If the v2 gateway adds a layer the SDK doesn't strip, the bounded-DFS
        // still finds credentials.screens[0].
        const screens = [{ username: "u", password: "p", m3uUrl: "http://x/get.php" }];
        expect(extractScreen({ data: { task: { credentials: { screens } } } }).password).toBe("p");
        expect(extractScreen({ result: { task: { credentials: { screens } } } }).username).toBe("u");
        expect(extractScreen({ data: { result: { credentials: { screens } } } }).m3uUrl).toContain("get.php");
    });

    it("extracts m3u/epg/password for an atlaspro order payload (orders.get shape)", () => {
        const orderPayload = {
            order: {
                status: "completed",
                credentials: {
                    screens: [
                        {
                            username: CHEF_USERNAME,
                            password: CHEF_PASSWORD,
                            m3uUrl: "http://lg.stir.wales:8080/get.php?username=x&password=y&type=m3u_plus",
                            epgUrl: "http://lg.stir.wales:8080/xmltv.php",
                        },
                    ],
                },
            },
        };
        const s = extractScreen(orderPayload);
        expect(s.username).toBe(CHEF_USERNAME);
        expect(s.password).toBe(CHEF_PASSWORD);
        expect(s.m3uUrl).toContain("get.php");
        expect(s.epgUrl).toContain("xmltv");
    });

    it("does not corrupt an all-digit username (string preserved verbatim)", () => {
        const s = extractScreen({
            credentials: { screens: [{ username: CHEF_USERNAME, password: CHEF_PASSWORD }] },
        });
        expect(s.username).toHaveLength(20);
        expect(s.username).toBe(CHEF_USERNAME);
    });

    it("returns nulls (not a throw) for empty / malformed payloads", () => {
        expect(extractScreen(null).password).toBeNull();
        expect(extractScreen({}).username).toBeNull();
        expect(extractScreen({ credentials: { screens: [] } }).password).toBeNull();
    });

    it("falls back to the credentials envelope for expiresAt", () => {
        const s = extractScreen({
            credentials: {
                expiresAt: "2026-06-01T00:00:00.000Z",
                screens: [{ username: "u", password: "p" }],
            },
        });
        expect(s.expiresAt).toBe("2026-06-01T00:00:00.000Z");
    });
});

describe("isUpstreamCompleted (bug 1)", () => {
    it("treats completed/active/success as done", () => {
        for (const s of ["completed", "ACTIVE", "Success"]) {
            expect(isUpstreamCompleted(s)).toBe(true);
        }
    });
    it("treats pending/processing/failed/empty as not done", () => {
        for (const s of ["queued", "processing", "failed", "", null, undefined]) {
            expect(isUpstreamCompleted(s)).toBe(false);
        }
    });
});

describe("parsePlanDurationDays (bug 4 — trial expiry compute)", () => {
    it("parses trial '2j' / '2d' as 2 days", () => {
        expect(parsePlanDurationDays("ironmax-trial-2d", "Trial 2j")).toBe(2);
        expect(parsePlanDurationDays(null, "Essai 2 jours")).toBe(2);
    });
    it("parses months and years", () => {
        expect(parsePlanDurationDays("iptv-12m")).toBe(360);
        expect(parsePlanDurationDays(null, "1 Mois")).toBe(30);
        expect(parsePlanDurationDays("iptv-1y")).toBe(365);
    });
    it("returns null when no duration token is present (never guesses)", () => {
        expect(parsePlanDurationDays("iptv-trial", "Trial")).toBeNull();
        expect(parsePlanDurationDays(null, null)).toBeNull();
    });
});
