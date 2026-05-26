/**
 * Pure helper: build the wonSnapshot stored on a game top-up order so the
 * reseller orders UI (G2BulkOrdersSection) can show a human product title and
 * the player it was topped up for, instead of "Produit game:NNNN".
 */
export interface GameWonSnapshot {
    kind: "game";
    gameCode: string;
    catalogueId: number;
    player: Record<string, string>;
    title: string;
    playerName: string | null;
    lb?: unknown;
}

/** "freefire_global" -> "Freefire Global". */
export function prettifyGameCode(code: string): string {
    return code
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

export function buildGameWonSnapshot(args: {
    gameCode: string;
    catalogueId: number;
    packageName: string;
    player: Record<string, string>;
    lb?: unknown;
}): GameWonSnapshot {
    const playerName = args.player.userid ?? Object.values(args.player)[0] ?? null;
    return {
        kind: "game",
        gameCode: args.gameCode,
        catalogueId: args.catalogueId,
        player: args.player,
        lb: args.lb,
        title: `${prettifyGameCode(args.gameCode)} · ${args.packageName}`,
        playerName,
    };
}
