import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
    db: {
        query: {
            notificationTemplates: {
                findFirst: async () => null, // force DB-miss → fallback to defaults
            },
        },
    },
}));

import {
    TEMPLATE_DEFAULTS,
    TEMPLATE_VARIABLES,
    loadAndRender,
    renderTemplate,
} from "@/services/notification-templates.service";

describe("streaming notification templates", () => {
    it("defines streaming.netflix.delivered with required variables", () => {
        expect(TEMPLATE_DEFAULTS["streaming.netflix.delivered"]).toBeTruthy();
        for (const v of [
            "brandName",
            "accountEmail",
            "accountPassword",
            "profileName",
            "profilePin",
            "activationUrl",
            "extraMemberHint",
        ]) {
            expect(TEMPLATE_VARIABLES["streaming.netflix.delivered"]).toContain(v);
        }
    });

    it("defines streaming.household.update_required template", () => {
        const t = TEMPLATE_DEFAULTS["streaming.household.update_required"];
        expect(t).toMatch(/{{brandName}}/);
        expect(t).toMatch(/{{activationUrl}}/);
        expect(t.toLowerCase()).toContain("4g");
    });

    it("renders activation URL into the delivered template", async () => {
        const rendered = await loadAndRender("streaming.netflix.delivered", {
            brandName: "Netflix",
            accountEmail: "shared@x.com",
            accountPassword: "P@ss",
            profileName: "Profil 2",
            profilePin: "1234",
            activationUrl: "https://boutique.nexusbox.tech/activer/abcDEF",
            extraMemberHint: "\n✨ Stream garanti — pas de conflit d'écrans",
        });
        expect(rendered).toContain("Netflix");
        expect(rendered).toContain("https://boutique.nexusbox.tech/activer/abcDEF");
        expect(rendered).toContain("Stream garanti");
    });

    it("substitutes missing vars with empty string (KISS)", () => {
        const out = renderTemplate("a {{x}} b {{y}}", { x: "1" });
        expect(out).toBe("a 1 b ");
    });
});
