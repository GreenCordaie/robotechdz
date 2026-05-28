import { logger } from "@/lib/logger";

/**
 * Error whose message is intentional and safe to surface to the end user
 * (caissier/admin). Anything that is NOT a UserError is treated as an internal
 * failure: its real message is logged server-side and the caller is given a
 * generic message, so DB/SQL internals (column names, constraints) never leak
 * to the client.
 */
export class UserError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UserError";
    }
}

const GENERIC_CLIENT_MESSAGE = "Une erreur est survenue. Veuillez réessayer.";

/**
 * Maps any thrown value to a client-safe string. UserError messages pass
 * through; everything else is logged server-side and replaced by a generic
 * message. Use at server-action catch boundaries instead of returning
 * `(error as Error).message`.
 */
export function toClientError(
    error: unknown,
    context?: { action?: string; userId?: number },
): string {
    if (error instanceof UserError) return error.message;
    logger.error(error instanceof Error ? error.message : String(error), {
        userId: context?.userId,
        action: context?.action ?? "ACTION_FAILED",
    });
    return GENERIC_CLIENT_MESSAGE;
}
