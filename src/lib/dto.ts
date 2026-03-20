import { users } from "@/db/schema";

/**
 * Enterprise DTO (Data Transfer Object) patterns.
 * Ensures sensitive data never leaves the Service Layer.
 */

// 1. Explicit Drizzle Selection Object for Public User Data
export const UserDTOSelect = {
    id: users.id,
    nom: users.nom,
    email: users.email,
    role: users.role,
    avatarUrl: users.avatarUrl,
    lastActiveAt: users.lastActiveAt,
    createdAt: users.createdAt,
};

// 2. Generic Utility to strip sensitive fields from any object (Safety Net)
export function sanitize<T extends object>(data: T): Partial<T> {
    const secretFields = ["passwordHash", "pinCode", "twoFactorSecret", "mfaBackupCodes"];

    // Handle Arrays
    if (Array.isArray(data)) {
        return data.map(item => sanitize(item)) as any;
    }

    const clean = { ...data };
    secretFields.forEach(key => {
        if (key in clean) {
            delete (clean as any)[key];
        }
    });

    return clean;
}

/**
 * Example use in Service Layer:
 * 
 * const user = await db.select(UserDTOSelect).from(users).where(...);
 * return user[0];
 * 
 * OR 
 * 
 * const rawUser = await db.query.users.findFirst(...);
 * return sanitize(rawUser);
 */
