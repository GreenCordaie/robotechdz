"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { isNetflixHouseholdUrl } from "@/lib/netflix-url";

interface Props {
    token: string;
    brandName: string;
    /** White-label: the reseller's brand shown to their own customer. */
    resellerBrand?: string | null;
    accentColor?: string | null;
    brandLogoUrl?: string | null;
    supportWhatsapp?: string | null;
    supportPhone?: string | null;
    email: string;
    profileName: string;
    pin: string;
    hasExtraMember: boolean;
    validUntil: string;
}

type LiveEvent =
    | { type: "OTP_CODE"; value: string; timestamp: string }
    | { type: "HOUSEHOLD_LINK"; value: string; timestamp: string };

/** Copy any string to the clipboard; resolves false on failure. */
async function copyText(value: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch {
        return false;
    }
}

export function ActivationClient(props: Props) {
    const [revealPin, setRevealPin] = useState(false);
    const [latest, setLatest] = useState<LiveEvent | null>(null);
    const [requesting, setRequesting] = useState(false);
    const [connected, setConnected] = useState(false);
    const esRef = useRef<EventSource | null>(null);

    // SSE subscription
    useEffect(() => {
        let stopped = false;
        // Stamp the page-open instant so the server's SSE replay only
        // surfaces OTPs Netflix sent AFTER the customer pressed
        // "envoyer le code". Without this window, a stale residual
        // email from an earlier login attempt would be served and
        // look identical to the fresh code.
        const sinceParam = encodeURIComponent(new Date().toISOString());

        function connect() {
            if (stopped) return;
            const es = new EventSource(
                `/api/activer/${props.token}/events?since=${sinceParam}`,
            );
            esRef.current = es;

            es.onopen = () => setConnected(true);
            es.onerror = () => {
                setConnected(false);
                es.close();
                setTimeout(connect, 3_000); // graceful reconnect
            };
            // The server emits NAMED events (`event: slot_event\ndata: ...`).
            // EventSource.onmessage ONLY fires for events with no `event:`
            // field — using addEventListener("slot_event", ...) is required.
            const handleSlotEvent = (msg: MessageEvent) => {
                try {
                    const parsed = JSON.parse(msg.data);
                    // Server wraps payload as { event: "slot_event", data: { type, value, timestamp } }
                    const payload = parsed?.data ?? parsed;
                    if (payload && (payload.type || payload.value)) {
                        setLatest(payload as LiveEvent);
                    }
                } catch {
                    // ignore non-JSON heartbeats
                }
            };
            es.addEventListener("slot_event", handleSlotEvent);
            // Keep the default onmessage as a safety net for any future
            // unnamed events.
            es.onmessage = (msg) => {
                try {
                    const parsed = JSON.parse(msg.data);
                    if (parsed?.event === "slot_event" && parsed.data) {
                        setLatest(parsed.data as LiveEvent);
                    }
                } catch {
                    /* ignore */
                }
            };
        }

        connect();
        return () => {
            stopped = true;
            esRef.current?.close();
        };
    }, [props.token]);

    // Fast-poll loop — ask the server to mailbox-poll our account RIGHT
    // NOW, then keep nudging every 8 seconds while the customer is still
    // waiting for the OTP. The server side dedupes (4s lock) so spam-clicks
    // can't hammer MS Graph. As soon as `latest` lands (the LiveEvent
    // state is populated by the SSE subscriber), the loop unwinds and
    // we stop nudging — no more requests until the customer reloads.
    useEffect(() => {
        if (latest) return; // already have a fresh code, no need to nudge
        let alive = true;
        const fire = () => {
            if (!alive) return;
            fetch(`/api/activer/${props.token}/poll`, { method: "POST" }).catch(() => {});
        };
        // Kick once immediately, then every 8 seconds.
        fire();
        const id = setInterval(fire, 8_000);
        return () => {
            alive = false;
            clearInterval(id);
        };
    }, [props.token, latest]);

    // Heartbeat — marks "session active" so the watcher polls aggressively
    useEffect(() => {
        let alive = true;
        const beat = () => {
            if (!alive) return;
            fetch(`/api/activer/${props.token}/heartbeat`, { method: "POST" }).catch(() => {});
        };
        beat();
        const t = setInterval(beat, 60_000);
        return () => {
            alive = false;
            clearInterval(t);
        };
    }, [props.token]);

    const mask = (v: string) => (v ? "•".repeat(Math.max(v.length, 6)) : "");
    const accent = props.accentColor?.trim() || "#E50914"; // reseller brand color, fallback red
    const vendor = props.resellerBrand?.trim() || null;
    const supportWa = props.supportWhatsapp?.replace(/[^\d]/g, "") || null;

    return (
        <main className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100">
            <div className="w-full max-w-md sm:max-w-lg mx-auto px-4 sm:px-6 py-6 sm:py-10">
                <header className="flex items-center justify-between gap-3 mb-6">
                    <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-widest text-neutral-500">
                            Accès {props.brandName}
                        </div>
                        {props.brandLogoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={props.brandLogoUrl}
                                alt={vendor || "Logo"}
                                className="h-9 sm:h-10 my-1 object-contain max-w-[200px]"
                            />
                        ) : (
                            <h1 className="text-2xl sm:text-3xl font-semibold truncate">
                                {vendor || props.brandName}
                            </h1>
                        )}
                    </div>
                    <span
                        className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${
                            connected
                                ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                                : "border-neutral-700 text-neutral-400"
                        }`}
                    >
                        {connected ? "● en ligne" : "○ connexion"}
                    </span>
                </header>

                {props.hasExtraMember && (
                    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                        ✨ Stream garanti — pas de conflit d&apos;écrans
                    </div>
                )}

                <section className="rounded-2xl bg-neutral-900/80 border border-neutral-800 p-4 sm:p-5 mb-5">
                    <h2 className="text-xs sm:text-sm uppercase tracking-wider text-neutral-500 mb-3">
                        Tes accès
                    </h2>
                    <div className="space-y-2.5">
                        <CopyField label="Email" value={props.email} />
                        <CopyField label="Profil" value={props.profileName} />
                        {props.pin && (
                            <CopyField
                                label="PIN"
                                value={props.pin}
                                displayValue={revealPin ? props.pin : mask(props.pin)}
                                mono
                                extraAction={
                                    <button
                                        type="button"
                                        onClick={() => setRevealPin((v) => !v)}
                                        aria-label={revealPin ? "Masquer le PIN" : "Afficher le PIN"}
                                        className="shrink-0 p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                                    >
                                        {revealPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                }
                            />
                        )}
                    </div>
                </section>

                <section className="rounded-2xl bg-gradient-to-br from-red-950/40 to-neutral-900 border border-red-900/30 p-4 sm:p-5">
                    <h2 className="text-xs sm:text-sm uppercase tracking-wider text-red-300/80 mb-3">
                        Code temps réel
                    </h2>

                    {!latest && !requesting && (
                        <div className="py-6 text-center">
                            <button
                                type="button"
                                onClick={() => {
                                    setRequesting(true);
                                    fetch(`/api/activer/${props.token}/request-code`, {
                                        method: "POST",
                                    }).catch(() => {});
                                    // Safety revert: if no code arrives within 90s, let the
                                    // customer click again — they may have missed the Netflix
                                    // step or the mail is taking longer than usual.
                                    window.setTimeout(() => setRequesting(false), 90_000);
                                }}
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl transition text-white font-semibold text-base shadow-lg shadow-black/30 hover:opacity-90 active:opacity-80"
                                style={{ backgroundColor: accent }}
                            >
                                👁️ Voir mon code
                            </button>
                            <p className="text-neutral-500 text-xs mt-3">
                                Clique ici dès que Netflix te demande un code de connexion.
                            </p>
                        </div>
                    )}

                    {!latest && requesting && (
                        <div className="py-8 text-center">
                            <div className="text-3xl mb-2 animate-pulse">⏳</div>
                            <p className="text-neutral-300 text-sm">
                                Récupération de ton code…
                            </p>
                            <p className="text-neutral-500 text-xs mt-2">
                                Il s&apos;affichera ici dans quelques secondes.
                            </p>
                        </div>
                    )}

                    {latest?.type === "OTP_CODE" && (
                        <div className="text-center py-6">
                            <div className="text-xs text-neutral-400 mb-2">Ton code Netflix :</div>
                            <button
                                type="button"
                                onClick={() => void copyText(latest.value)}
                                title="Cliquer pour copier"
                                className="group w-full inline-flex items-center justify-center gap-2 sm:gap-3 rounded-xl px-3 py-2 hover:bg-white/5 transition"
                            >
                                <span className="text-4xl sm:text-5xl font-mono font-bold tracking-[0.3em] sm:tracking-[0.4em] text-white break-all">
                                    {latest.value}
                                </span>
                                <Copy className="w-5 h-5 text-neutral-500 group-hover:text-white shrink-0" />
                            </button>
                            <p className="text-neutral-500 text-xs mt-4">
                                Reçu à {new Date(latest.timestamp).toLocaleTimeString("fr-FR")}
                            </p>
                        </div>
                    )}

                    {latest?.type === "HOUSEHOLD_LINK" && (
                        <div className="py-2">
                            {isNetflixHouseholdUrl(latest.value) ? (
                                <>
                                    <div className="mb-4 text-sm text-neutral-300">
                                        📺 Netflix demande de mettre à jour le foyer. Clique sur le bouton ci-dessous
                                        pour valider.
                                    </div>
                                    <a
                                        href={latest.value}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block w-full text-center text-white font-semibold py-4 rounded-xl transition hover:opacity-90"
                                        style={{ backgroundColor: accent }}
                                    >
                                        Mettre à jour le foyer
                                    </a>
                                    <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-200">
                                        ⚠️ Important : ouvre ce lien sur ton mobile en <b>4G/5G</b> (pas en Wi-Fi)
                                        pour que la validation fonctionne du premier coup.
                                    </div>
                                </>
                            ) : (
                                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-3 text-sm text-amber-200">
                                    📺 Une demande de mise à jour du foyer est en cours de traitement.
                                    Contacte ton vendeur si l&apos;accès reste bloqué.
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {(supportWa || props.supportPhone) && (
                    <div className="mt-8 text-center">
                        <a
                            href={supportWa ? `https://wa.me/${supportWa}` : `tel:${props.supportPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-neutral-700 text-sm font-semibold text-neutral-200 hover:text-white hover:border-neutral-500 transition"
                        >
                            💬 Une question ? Contactez votre vendeur
                        </a>
                    </div>
                )}

                <footer className="mt-8 text-center text-xs text-neutral-600">
                    {vendor && <div className="mb-1 font-semibold text-neutral-500">{vendor}</div>}
                    Lien valide jusqu&apos;au {new Date(props.validUntil).toLocaleDateString("fr-FR")}
                </footer>
            </div>
        </main>
    );
}

/**
 * A label + value row that copies the value to the clipboard in one tap.
 * Shows a transient check + "Copié" confirmation. `displayValue` lets the
 * caller render a masked value (PIN) while copying the real one.
 */
function CopyField({
    label,
    value,
    displayValue,
    mono,
    extraAction,
}: {
    label: string;
    value: string;
    displayValue?: string;
    mono?: boolean;
    extraAction?: ReactNode;
}) {
    const [copied, setCopied] = useState(false);
    const onCopy = async () => {
        if (!value || value === "—") return;
        const ok = await copyText(value);
        if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    };
    return (
        <div className="flex items-stretch gap-2">
            <button
                type="button"
                onClick={onCopy}
                title="Cliquer pour copier"
                className="group flex-1 min-w-0 flex items-center justify-between gap-3 rounded-xl bg-neutral-950/60 border border-neutral-800 px-3.5 py-2.5 text-left hover:border-red-500/40 transition"
            >
                <span className="flex flex-col min-w-0">
                    <span className="text-[10px] uppercase tracking-widest text-neutral-500">
                        {label}
                    </span>
                    <span
                        className={`text-white break-all leading-snug ${
                            mono ? "font-mono text-base tracking-wider" : "text-base sm:text-lg font-medium"
                        }`}
                    >
                        {displayValue ?? value}
                    </span>
                </span>
                <span className="shrink-0 flex items-center gap-1">
                    {copied ? (
                        <>
                            <Check className="w-4 h-4 text-emerald-500" />
                            <span className="text-[10px] font-semibold text-emerald-500">Copié</span>
                        </>
                    ) : (
                        <Copy className="w-4 h-4 text-neutral-500 group-hover:text-white" />
                    )}
                </span>
            </button>
            {extraAction}
        </div>
    );
}
