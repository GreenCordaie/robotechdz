import { UserRole } from "./constants";

/**
 * Role hierarchy for strict ADMIN / SUPER_ADMIN separation.
 *
 * SUPER_ADMIN (3) > ADMIN (2) > {CAISSIER, TRAITEUR, RESELLER} (1)
 *
 * - `/superadmin/*` routes require strict SUPER_ADMIN.
 * - `/admin/*` routes accept ADMIN or SUPER_ADMIN.
 * - Lower roles (CAISSIER, TRAITEUR, RESELLER) only satisfy their own level.
 */
const ROLE_HIERARCHY: Record<string, number> = {
    [UserRole.SUPER_ADMIN]: 3,
    [UserRole.ADMIN]: 2,
    [UserRole.CAISSIER]: 1,
    [UserRole.TRAITEUR]: 1,
    [UserRole.RESELLER]: 1,
};

type UserLike = { role: UserRole | string } | null | undefined;

export function hasRole(user: UserLike, required: UserRole): boolean {
    if (!user || !user.role) return false;
    const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[required] ?? Infinity;
    return userLevel >= requiredLevel;
}

export function requireRole(user: UserLike, required: UserRole): void {
    if (!hasRole(user, required)) {
        throw new Error(`Forbidden: requires role ${required}`);
    }
}

export function isSuperAdmin(user: UserLike): boolean {
    return !!user && user.role === UserRole.SUPER_ADMIN;
}
