"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import { ArrowLeft, Search, Gamepad2 } from "lucide-react";

import {
    getG2BulkGamesAction,
    type G2BulkGame,
} from "../g2bulk-games-actions";

/**
 * Browse the G2Bulk game top-up catalog: a searchable grid of every game
 * (PUBG Mobile, Mobile Legends, Genshin…). Each tile links to the game's
 * package catalogue where the reseller picks a denomination and tops up.
 */
export default function ResellerGamesPage() {
    const router = useRouter();
    const [games, setGames] = useState<ReadonlyArray<G2BulkGame>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");

    useEffect(() => {
        let active = true;
        getG2BulkGamesAction({})
            .then((res) => {
                if (!active) return;
                if (res.success) setGames(res.data);
                else setError(res.error);
            })
            .catch(() => active && setError("Catalogue jeux indisponible"))
            .finally(() => active && setIsLoading(false));
        return () => {
            active = false;
        };
    }, []);

    const filtered = useMemo(() => {
        // Normalize away spaces/punctuation so "free fire" matches "Freefire"
        // and "pubg mobile" matches "PUBGM".
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const q = norm(query);
        if (!q) return games;
        return games.filter(
            (g) => norm(g.name).includes(q) || norm(g.code).includes(q),
        );
    }, [games, query]);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <button
                onClick={() => router.push("/reseller/shop")}
                className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={14} />
                Retour aux catégories
            </button>

            <header className="space-y-1">
                <h1 className="text-3xl lg:text-5xl font-black text-white tracking-tight flex items-center gap-3">
                    <Gamepad2 className="text-[#FACC15]" size={36} />
                    Game Top-Up
                </h1>
                <p className="text-sm text-slate-400">
                    {isLoading ? "Chargement…" : `${games.length} jeux · recharge in-game instantanée`}
                </p>
            </header>

            <div className="relative max-w-xl">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                    type="search"
                    placeholder="Rechercher un jeu…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    data-testid="games-search"
                    className="w-full h-12 pl-11 pr-4 rounded-full bg-[#161616] border border-[#262626] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]/60 focus:ring-2 focus:ring-[#FACC15]/20 transition-all"
                />
            </div>

            {isLoading ? (
                <div className="py-20 flex justify-center">
                    <Spinner color="warning" />
                </div>
            ) : error ? (
                <p className="text-center text-amber-400 italic py-12">{error}</p>
            ) : filtered.length === 0 ? (
                <p className="text-center text-slate-500 italic py-12">
                    Aucun jeu ne correspond à « {query} ».
                </p>
            ) : (
                <div
                    data-testid="games-grid"
                    className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3"
                >
                    {filtered.map((g) => (
                        <GameCard key={g.id} game={g} />
                    ))}
                </div>
            )}
        </div>
    );
}

const GameCard: React.FC<{ readonly game: G2BulkGame }> = ({ game }) => {
    const [imgFailed, setImgFailed] = useState(false);
    const initial = (game.name[0] || "?").toUpperCase();
    return (
        <Link
            href={`/reseller/shop/games/${encodeURIComponent(game.code)}`}
            data-testid="game-card"
            data-game-code={game.code}
            className="group relative aspect-square overflow-hidden rounded-2xl bg-[#161616] border border-[#262626] hover:border-[#FACC15] hover:ring-2 hover:ring-[#FACC15]/30 transition-all"
        >
            {!imgFailed && game.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={game.imageUrl}
                    alt={game.name}
                    loading="lazy"
                    onError={() => setImgFailed(true)}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
            ) : (
                <div
                    className="absolute inset-0 flex items-center justify-center text-white"
                    style={{
                        background: `linear-gradient(135deg, hsl(${hashHue(game.code)} 65% 32%), hsl(${hashHue(game.code) + 40} 65% 18%))`,
                    }}
                >
                    <span className="text-5xl font-black opacity-90">{initial}</span>
                </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-2.5">
                <h3 className="text-xs font-black text-white tracking-tight line-clamp-2">
                    {game.name}
                </h3>
            </div>
        </Link>
    );
};

const HUE_MOD = 360;
function hashHue(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % HUE_MOD;
}
