"use client";

import React from "react";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Spinner,
} from "@heroui/react";
import { Check, Copy, ShoppingBag, Clock, Send } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";
import { getResellerOrderDetailAction } from "../../actions";

// ---------------------------------------------------------------------------
// Types — mirror the getResellerOrderDetailAction payload (decrypted).
// ---------------------------------------------------------------------------

interface IptvCredentials {
    username?: string;
    password?: string;
    url?: string;
    m3u?: string;
    [k: string]: unknown;
}

interface OrderItemDetail {
    id: number;
    productName: string;
    quantity: number;
    standardCodes: string[];
    sharedSlots: { slotNumber: number; parentCode: string | null; pin: string | null; activationUrl: string | null }[];
    iptvProvisions: { id: number; status: string; credentials: IptvCredentials | null }[];
}

interface OrderDetail {
    id: number;
    orderNumber: string;
    status: string;
    items: OrderItemDetail[];
}

const TERMINAL_STATUSES = new Set(["LIVRE", "TERMINE", "ANNULE", "REMBOURSE"]);
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 60_000;

/** True when an order item actually carries a deliverable code/credential. */
function itemHasContent(item: OrderItemDetail): boolean {
    if (item.standardCodes.length > 0) return true;
    if (item.sharedSlots.some((s) => s.parentCode || s.pin || s.activationUrl)) return true;
    if (item.iptvProvisions.some((p) => p.credentials)) return true;
    return false;
}

function orderHasAnyContent(order: OrderDetail | null): boolean {
    return !!order && order.items.some(itemHasContent);
}

/** Small click-to-copy line. */
function CopyRow({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = React.useState(false);
    const copy = () => {
        navigator.clipboard
            .writeText(value)
            .then(() => {
                setCopied(true);
                toast.success(`${label} copié`);
                setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => toast.error("Impossible de copier"));
    };
    return (
        <button
            type="button"
            onClick={copy}
            className="w-full flex items-center justify-between gap-3 bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-2 hover:border-[#FACC15]/40 transition-colors text-left group"
        >
            <span className="flex flex-col min-w-0">
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-500">{label}</span>
                <span className="font-mono text-sm text-white truncate">{value}</span>
            </span>
            {copied ? (
                <Check className="size-4 text-emerald-500 shrink-0" />
            ) : (
                <Copy className="size-4 text-slate-500 group-hover:text-[#FACC15] shrink-0" />
            )}
        </button>
    );
}

/** Open WhatsApp (the reseller's own app/number) with a prefilled message.
 * No central WAHA session involved — uses the reseller's own device. */
function openWhatsApp(message: string) {
    window.open(
        `https://wa.me/?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer",
    );
}

/**
 * Build ONE customer-facing message covering everything delivered in the
 * order, so the reseller can forward it from their own WhatsApp regardless of
 * product type (giftcard codes, IPTV credentials, shared-account magic links).
 *
 * For shared slots we share the magic LINK only (customer-safe) when present;
 * the raw account/PIN stays in the modal for the reseller's records. Falls
 * back to account/PIN when a slot has no magic link (non-Netflix sharing).
 */
function buildOrderShareMessage(
    order: OrderDetail | null,
    initialCode: string | undefined,
    resellerName?: string,
): string {
    const who = resellerName?.trim() ? ` — ${resellerName.trim()}` : "";
    const lines: string[] = [`🛍️ *Votre commande*${who}`, ""];
    let hasMagicLink = false;

    if (initialCode) {
        lines.push(`*Code :* ${initialCode}`, "");
    }

    for (const item of (order?.items ?? []).filter(itemHasContent)) {
        lines.push(`*${item.productName}*`);
        for (const c of item.standardCodes) lines.push(`• Code : ${c}`);
        for (const s of item.sharedSlots) {
            if (s.activationUrl) {
                hasMagicLink = true;
                lines.push(`• Lien d'activation : ${s.activationUrl}`);
            } else {
                if (s.parentCode) lines.push(`• Compte : ${s.parentCode}`);
                if (s.pin) lines.push(`• PIN : ${s.pin}`);
            }
        }
        for (const p of item.iptvProvisions) {
            if (!p.credentials) continue;
            for (const [k, v] of Object.entries(p.credentials)) {
                if (typeof v === "string" && v) lines.push(`• ${k} : ${v}`);
            }
        }
        lines.push("");
    }

    if (hasMagicLink) {
        lines.push(
            "📺 Pour un accès avec lien : ouvrez le lien, puis cliquez « Voir mon code » quand le service demande un code de connexion.",
            "",
        );
    }

    lines.push("Merci de votre confiance ! 🙏");
    return lines.join("\n");
}

export interface PurchaseSuccessModalProps {
    isOpen: boolean;
    onClose: () => void;
    orderId: number | null;
    productLabel?: string;
    /** Code already returned synchronously (e.g. Active Code instant delivery). */
    initialCode?: string;
    /** Reseller shop name — used to sign the WhatsApp share message. */
    resellerName?: string;
}

export default function PurchaseSuccessModal({
    isOpen,
    onClose,
    orderId,
    productLabel,
    initialCode,
    resellerName,
}: PurchaseSuccessModalProps) {
    const [order, setOrder] = React.useState<OrderDetail | null>(null);
    const [polling, setPolling] = React.useState(false);
    const [timedOut, setTimedOut] = React.useState(false);

    React.useEffect(() => {
        if (!isOpen || !orderId) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const startedAt = Date.now();
        setOrder(null);
        setTimedOut(false);
        setPolling(true);

        const tick = async () => {
            if (cancelled) return;
            const res = await getResellerOrderDetailAction({ orderId });
            if (cancelled) return;
            if (res && "success" in res && res.success) {
                const data = res.data as unknown as OrderDetail;
                setOrder(data);
                const done = orderHasAnyContent(data) || TERMINAL_STATUSES.has(data.status);
                if (done) {
                    setPolling(false);
                    return;
                }
            }
            if (Date.now() - startedAt >= POLL_MAX_MS) {
                setPolling(false);
                setTimedOut(true);
                return;
            }
            timer = setTimeout(tick, POLL_INTERVAL_MS);
        };
        void tick();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [isOpen, orderId]);

    const delivered = orderHasAnyContent(order) || !!initialCode;

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside">
            <ModalContent className="bg-[#161616] border border-[#262626]">
                {(close) => (
                    <>
                        <ModalHeader className="flex items-center gap-3">
                            <div className="size-10 rounded-xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                                <ShoppingBag className="size-5" />
                            </div>
                            <div>
                                <p className="text-white font-black">Achat confirmé</p>
                                {productLabel && <p className="text-xs text-slate-500 font-medium">{productLabel}</p>}
                            </div>
                        </ModalHeader>

                        <ModalBody className="space-y-4">
                            {/* Instant code (Active Code) */}
                            {initialCode && !delivered && (
                                <CopyRow label="Code" value={initialCode} />
                            )}

                            {delivered && order ? (
                                order.items.filter(itemHasContent).map((item) => (
                                    <div key={item.id} className="space-y-2">
                                        <p className="text-xs font-black text-slate-300">{item.productName}</p>
                                        {item.standardCodes.map((c, i) => (
                                            <CopyRow key={`c-${i}`} label="Code" value={c} />
                                        ))}
                                        {item.sharedSlots.map((s, i) => (
                                            <React.Fragment key={`s-${i}`}>
                                                {s.activationUrl && (
                                                    <CopyRow label="Lien client (magic link)" value={s.activationUrl} />
                                                )}
                                                {s.parentCode && <CopyRow label="Compte" value={s.parentCode} />}
                                                {s.pin && <CopyRow label="PIN / Slot" value={s.pin} />}
                                            </React.Fragment>
                                        ))}
                                        {item.iptvProvisions.map((p) =>
                                            p.credentials
                                                ? Object.entries(p.credentials)
                                                      .filter(([, v]) => typeof v === "string" && v)
                                                      .map(([k, v]) => (
                                                          <CopyRow key={`${p.id}-${k}`} label={k} value={String(v)} />
                                                      ))
                                                : null
                                        )}
                                    </div>
                                ))
                            ) : initialCode ? null : timedOut ? (
                                <div className="flex flex-col items-center text-center gap-2 py-4">
                                    <Clock className="size-8 text-amber-500" />
                                    <p className="text-sm text-slate-300 font-bold">Livraison en cours</p>
                                    <p className="text-xs text-slate-500">
                                        Le code sera disponible dans « Mes Achats » une fois prêt.
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center text-center gap-3 py-6">
                                    <Spinner size="lg" color="warning" />
                                    <p className="text-sm text-slate-300 font-bold">Livraison en cours…</p>
                                    <p className="text-xs text-slate-500">Récupération du code, un instant.</p>
                                </div>
                            )}

                            {/* Global share — available for EVERY delivered order
                                (giftcard codes, IPTV credentials, magic links). */}
                            {delivered && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        openWhatsApp(
                                            buildOrderShareMessage(order, initialCode, resellerName),
                                        )
                                    }
                                    className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-black font-black rounded-lg px-3 py-2.5 hover:bg-[#25D366]/90 transition-colors"
                                >
                                    <Send className="size-4" /> Partager sur WhatsApp
                                </button>
                            )}
                        </ModalBody>

                        <ModalFooter className="flex items-center justify-between">
                            <Link
                                href="/reseller/wallet?tab=orders"
                                className="text-xs font-bold text-slate-400 hover:text-[#FACC15]"
                            >
                                Voir Mes Achats
                            </Link>
                            <Button onPress={close} className="bg-[#FACC15] text-black font-black">
                                Fermer
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
}
