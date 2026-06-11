/**
 * Downloads brand category images from buysellvouchers CDN and saves them
 * to public/brands/<slug>.png with our local slug naming.
 *
 * Usage: node scripts/fetch-brand-images.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "public", "brands");
const CDN = "https://cdn.bsvmarket.com/images";

// Mapping: our local slug -> remote path (relative to CDN root).
// Prefer popular-categories (clean square art) when available, fallback to
// product-images. Curated to match the 21+ categories the reseller shop ships.
const BRANDS = {
    // Top brands
    amazon: "popular-categories/amazon.webp",
    "google-play": "popular-categories/google_play.webp",
    netflix: "popular-categories/netflix.webp",
    "nintendo-eshop": "popular-categories/nintendo.webp",
    "nintendo-switch-online": "popular-categories/nintendo.webp",
    playstation: "popular-categories/playstation.webp",
    "razer-gold": "popular-categories/razer.webp",
    "riot-access": "popular-categories/riot.webp",
    spotify: "popular-categories/spotify.webp",
    uber: "popular-categories/uber.webp",
    valorant: "popular-categories/valorant.webp",
    xbox: "popular-categories/xbox.webp",
    fortnite: "popular-categories/fortnite.webp",

    // Gaming (product-images set, transparent PNG)
    "free-fire": "product-images/Games-Free_Fire.png",
    "pubg-mobile": "product-images/Games-PLAYERUNKNOWNS_BATTLEGROUNDS_aka_PUBG.png",
    "mobile-legends": "product-images/Games-Mobile_Legends.png",
    "apex-legends": "product-images/Games-Apex_Legends.png",
    "call-of-duty": "product-images/Games-Call-of-Duty.png",
    blizzard: "product-images/Games-Blizzard.png",
    "clash-royale": "product-images/Games-Clash_Royale.png",
    "clash-of-clans": "product-images/Games-Clash_of_Clans.png",
    "league-of-legends": "product-images/Games-League_of_Legends.png",
    jawaker: "product-images/Games-JAWAKER.png",
    "world-of-warcraft": "product-images/Games-World_of_warcraft_aka_WOW.png",
    gta5: "product-images/Games-Grand_Theft_Auto_V.png",
    gamestop: "product-images/Games-GameStop.png",
    "bigo-live": "product-images/Games-Bigo_Live.png",

    // The Discord / Steam / iTunes / IMO / Twitch / Minecraft / Yalla / New State /
    // Roblox / Test entries — pull from product-images alternate naming.
    discord: "product-images/discord-sub.png",
    steam: "product-images/Gift_cards-Steam_Gift_Cards.png",
    "apple-itunes": "product-images/Gift_cards-iTunes_Gift_Cards.png",
    imo: "product-images/VoIP-Imo.png",
    twitch: "product-images/Gift_cards-Twitch.png",
    minecraft: "product-images/games-minecraft-gift-card.png",
    "yalla-ludo": "product-images/Games-Yalla_Ludo.png",
    "new-state-mobile": "product-images/pubg-new-state-nc-gift-cards.png",
    roblox: "product-images/Gift_cards-Roblox.png",
};

await mkdir(OUT_DIR, { recursive: true });

let ok = 0;
let skip = 0;
let fail = 0;

for (const [slug, remote] of Object.entries(BRANDS)) {
    const url = `${CDN}/${remote}`;
    const ext = path.extname(remote).slice(1); // 'png' / 'webp'
    const dest = path.join(OUT_DIR, `${slug}.${ext}`);

    if (existsSync(dest)) {
        skip++;
        continue;
    }

    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                Referer: "https://www.buysellvouchers.com/",
            },
        });
        if (!res.ok) {
            console.warn(`✗ ${slug}: HTTP ${res.status} for ${url}`);
            fail++;
            continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(dest, buf);
        console.log(`✓ ${slug}.${ext} (${buf.length} bytes)`);
        ok++;
    } catch (err) {
        console.warn(`✗ ${slug}: ${err.message}`);
        fail++;
    }
}

console.log(`\nDone: ${ok} downloaded, ${skip} already present, ${fail} failed.`);
console.log(`Saved to: ${OUT_DIR}`);
