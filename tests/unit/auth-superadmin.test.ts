import { describe, it, expect } from "vitest";
import { UserRole } from "@/lib/constants";
import { hasRole, requireRole } from "@/lib/roles";

describe("SUPER_ADMIN role strict separation", () => {
    it("ADMIN does NOT satisfy hasRole(SUPER_ADMIN)", () => {
        const user = { id: 1, role: UserRole.ADMIN } as any;
        expect(hasRole(user, UserRole.SUPER_ADMIN)).toBe(false);
    });

    it("SUPER_ADMIN satisfies hasRole(ADMIN) (hierarchy)", () => {
        const user = { id: 1, role: UserRole.SUPER_ADMIN } as any;
        expect(hasRole(user, UserRole.ADMIN)).toBe(true);
    });

    it("SUPER_ADMIN satisfies hasRole(SUPER_ADMIN)", () => {
        const user = { id: 1, role: UserRole.SUPER_ADMIN } as any;
        expect(hasRole(user, UserRole.SUPER_ADMIN)).toBe(true);
    });

    it("RESELLER does not satisfy hasRole(ADMIN)", () => {
        const user = { id: 1, role: UserRole.RESELLER } as any;
        expect(hasRole(user, UserRole.ADMIN)).toBe(false);
    });

    it("null user does not satisfy any role", () => {
        expect(hasRole(null, UserRole.RESELLER)).toBe(false);
        expect(hasRole(null, UserRole.ADMIN)).toBe(false);
        expect(hasRole(null, UserRole.SUPER_ADMIN)).toBe(false);
    });

    it("requireRole throws when role is insufficient", () => {
        const user = { id: 1, role: UserRole.ADMIN } as any;
        expect(() => requireRole(user, UserRole.SUPER_ADMIN)).toThrow(/Forbidden/);
    });

    it("requireRole does not throw when role is sufficient", () => {
        const user = { id: 1, role: UserRole.SUPER_ADMIN } as any;
        expect(() => requireRole(user, UserRole.ADMIN)).not.toThrow();
    });

    it("CAISSIER and TRAITEUR do not satisfy hasRole(ADMIN)", () => {
        expect(hasRole({ role: UserRole.CAISSIER } as any, UserRole.ADMIN)).toBe(false);
        expect(hasRole({ role: UserRole.TRAITEUR } as any, UserRole.ADMIN)).toBe(false);
    });
});
