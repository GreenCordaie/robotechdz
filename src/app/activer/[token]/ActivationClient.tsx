"use client";

import { useEffect, useRef, useState } from "react";
import { isNetflixHouseholdUrl } from "@/lib/netflix-url";

interface Props {
    token: string;
    brandName: string;
    email: string;
    password: string;
    profileName: string;
    pin: string;
    hasExtraMember: boolean;
    validUntil: string;
}

type LiveEvent =
    | { type: "OTP_CODE"; value: string; timestamp: string }
    | { type: "HOUSEHOLD_LINK"; value: string; timestamp: string };

export function ActivationClient(props: Props) {
    const [revealPwd, setRevealPwd] = useState(false);
    const [revealPin, setRevealPin] = useState(false);
    const [latest, setLatest] = useState<LiveEvent | null>(null);
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

    return (
        <main className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100">
            <div className="max-w-md mx-auto px-5 py-8">
                <header className="flex items-center justify-between mb-6">
                    <div>
                        <div className="text-xs uppercase tracking-widest text-neutral-500">Streaming</div>
                        <h1 className="text-2xl font-semibold">{props.brandName}</h1>
                    </div>
                    <span
                        className={`text-[10px] px-2 py-1 rounded-full border ${
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

                <section className="rounded-2xl bg-neutral-900/80 border border-neutral-800 p-5 mb-5">
                    <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">Tes accès</h2>
                    <div className="space-y-3">
                        <Row label="Email" value={props.email} />
                        <Row
                            label="Mot de passe"
                            value={revealPwd ? props.password : mask(props.password)}
                            action={
                                <button
                                    onClick={() => setRevealPwd((v) => !v)}
                                    className="text-xs text-neutral-400 hover:text-white"
                                >
                                    {revealPwd ? "Masquer" : "Afficher"}
                                </button>
                            }
                        />
                        <Row label="Profil" value={props.profileName} />
                        {props.pin && (
                            <Row
                                label="PIN"
                                value={revealPin ? props.pin : mask(props.pin)}
                                action={
                                    <button
                                        onClick={() => setRevealPin((v) => !v)}
                                        className="text-xs text-neutral-400 hover:text-white"
                                    >
                                        {revealPin ? "Masquer" : "Afficher"}
                                    </button>
                                }
                            />
                        )}
                    </div>
                </section>

                <section className="rounded-2xl bg-gradient-to-br from-red-950/40 to-neutral-900 border border-red-900/30 p-5">
                    <h2 className="text-sm uppercase tracking-wider text-red-300/80 mb-3">
                        Code temps réel
                    </h2>

                    {!latest && (
                        <div className="py-8 text-center">
                            <div className="text-3xl mb-2">⏳</div>
                            <p className="text-neutral-400 text-sm">
                                Surveillance active de la boîte mail Netflix...
                            </p>
                            <p className="text-neutral-600 text-xs mt-2">
                                Dès que ton code arrive, il apparaît ici.
                            </p>
                        </div>
                    )}

                    {latest?.type === "OTP_CODE" && (
                        <div className="text-center py-6">
                            <div className="text-xs text-neutral-400 mb-2">Ton code Netflix :</div>
                            <div className="text-5xl font-mono font-bold tracking-[0.4em] text-white">
                                {latest.value}
                            </div>
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
                                        className="block w-full text-center bg-red-600 hover:bg-red-500 text-white font-semibold py-4 rounded-xl transition"
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

                <footer className="mt-8 text-center text-xs text-neutral-600">
                    Lien valide jusqu&apos;au {new Date(props.validUntil).toLocaleDateString("fr-FR")}
                </footer>
            </div>
        </main>
    );
}

function Row({
    label,
    value,
    action,
}: {
    label: string;
    value: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-neutral-500 w-28 shrink-0">{label}</div>
            <div className="font-mono text-sm text-white truncate flex-1 text-right">{value}</div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}
