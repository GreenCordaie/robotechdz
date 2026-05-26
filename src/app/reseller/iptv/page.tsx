"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner, Tabs, Tab } from "@heroui/react";
import { Tv, ChevronDown } from "lucide-react";
import { toast } from "react-hot-toast";

import { ShopTopNav } from "@/app/reseller/shop/components/ShopTopNav";
import {
    getIptvCatalogAction,
    listMyIptvOrdersAction,
} from "@/app/reseller/iptv/actions";
import {
    asErrorString,
    PROVIDER_BADGES,
    type IptvProvider,
} from "./components/iptv-status";
import {
    IptvCatalogCard,
    type IptvProductLike,
} from "./components/IptvCatalogCard";
import {
    IptvLinesTable,
    type IptvLineRow,
    type StatusFilter,
} from "./components/IptvLinesTable";
import { IptvCheckoutModal } from "./components/IptvCheckoutModal";
import { IptvLineDetailModal } from "./components/IptvLineDetailModal";

const PROVIDERS: ReadonlyArray<IptvProvider> = [
    "panelking365",
    "atlaspro",
    "ironmax",
    "ibosol",
];

const DEFAULT_PROVIDER: IptvProvider = "panelking365";
const LIMIT = 20;
const REFRESH_MS = 30_000;

function isProvider(value: string | null): value is IptvProvider {
    return !!value && (PROVIDERS as ReadonlyArray<string>).includes(value);
}

interface ProviderState {
    catalog: ReadonlyArray<IptvProductLike>;
    isLoadingCatalog: boolean;
    catalogError: string | null;
    items: ReadonlyArray<IptvLineRow>;
    total: number;
    page: number;
    totalPages: number;
    search: string;
    statusFilter: StatusFilter;
    isLoadingItems: boolean;
}

function emptyState(): ProviderState {
    return {
        catalog: [],
        isLoadingCatalog: true,
        catalogError: null,
        items: [],
        total: 0,
        page: 1,
        totalPages: 1,
        search: "",
        statusFilter: "ALL",
        isLoadingItems: true,
    };
}

export default function ResellerIptvPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tabParam = searchParams?.get("tab") ?? null;
    const initialProvider: IptvProvider = isProvider(tabParam)
        ? tabParam
        : DEFAULT_PROVIDER;
    const [provider, setProvider] = useState<IptvProvider>(initialProvider);

    const [states, setStates] = useState<Record<IptvProvider, ProviderState>>(
        () => ({
            panelking365: emptyState(),
            atlaspro: emptyState(),
            ironmax: emptyState(),
            ibosol: emptyState(),
        }),
    );

    const [catalogOpen, setCatalogOpen] = useState(true);
    const [checkoutProduct, setCheckoutProduct] =
        useState<IptvProductLike | null>(null);
    const [detailOrderId, setDetailOrderId] = useState<number | null>(null);

    /* ── Tab sync ───────────────────────────────────────────────── */

    const handleTabChange = useCallback(
        (key: React.Key) => {
            const next = String(key);
            if (!isProvider(next)) return;
            setProvider(next);
            const params = new URLSearchParams(
                Array.from(searchParams?.entries() ?? []),
            );
            params.set("tab", next);
            router.replace(`/reseller/iptv?${params.toString()}`, {
                scroll: false,
            });
        },
        [router, searchParams],
    );

    /* ── Catalog loader ─────────────────────────────────────────── */

    const loadCatalog = useCallback((p: IptvProvider) => {
        setStates((prev) => ({
            ...prev,
            [p]: { ...prev[p], isLoadingCatalog: true, catalogError: null },
        }));
        getIptvCatalogAction({ provider: p })
            .then((res) => {
                if (res.success) {
                    const items = (res.data as ReadonlyArray<IptvProductLike>) ?? [];
                    setStates((prev) => ({
                        ...prev,
                        [p]: {
                            ...prev[p],
                            catalog: items,
                            isLoadingCatalog: false,
                            catalogError: null,
                        },
                    }));
                } else {
                    setStates((prev) => ({
                        ...prev,
                        [p]: {
                            ...prev[p],
                            isLoadingCatalog: false,
                            catalogError: asErrorString(
                                res.error,
                                "Catalogue indisponible",
                            ),
                        },
                    }));
                }
            })
            .catch((err) => {
                setStates((prev) => ({
                    ...prev,
                    [p]: {
                        ...prev[p],
                        isLoadingCatalog: false,
                        catalogError: asErrorString(
                            err,
                            "Catalogue indisponible",
                        ),
                    },
                }));
            });
    }, []);

    /* ── Lines loader ───────────────────────────────────────────── */

    const loadLines = useCallback(
        (p: IptvProvider, opts?: { silent?: boolean }) => {
            const silent = opts?.silent ?? false;
            setStates((prev) => {
                const cur = prev[p];
                return {
                    ...prev,
                    [p]: {
                        ...cur,
                        isLoadingItems: silent ? cur.isLoadingItems : true,
                    },
                };
            });

            // Snapshot the current filters from state at call time.
            setStates((prev) => {
                const cur = prev[p];
                listMyIptvOrdersAction({
                    provider: p,
                    status:
                        cur.statusFilter === "ALL"
                            ? undefined
                            : cur.statusFilter,
                    search: cur.search.trim() || undefined,
                    page: cur.page,
                    limit: LIMIT,
                })
                    .then((res) => {
                        if (res.success) {
                            const data = res.data as {
                                items: ReadonlyArray<IptvLineRow>;
                                pagination: {
                                    page: number;
                                    limit: number;
                                    total: number;
                                    totalPages: number;
                                };
                            };
                            setStates((s) => ({
                                ...s,
                                [p]: {
                                    ...s[p],
                                    items: data.items,
                                    total: data.pagination.total,
                                    totalPages: data.pagination.totalPages,
                                    isLoadingItems: false,
                                },
                            }));
                        } else {
                            if (!silent) {
                                toast.error(
                                    asErrorString(
                                        res.error,
                                        "Échec chargement des lignes",
                                    ),
                                );
                            }
                            setStates((s) => ({
                                ...s,
                                [p]: { ...s[p], isLoadingItems: false },
                            }));
                        }
                    })
                    .catch((err) => {
                        if (!silent) {
                            toast.error(
                                asErrorString(
                                    err,
                                    "Échec chargement des lignes",
                                ),
                            );
                        }
                        setStates((s) => ({
                            ...s,
                            [p]: { ...s[p], isLoadingItems: false },
                        }));
                    });
                return prev;
            });
        },
        [],
    );

    /* ── Initial + tab-change load ──────────────────────────────── */

    useEffect(() => {
        const s = states[provider];
        if (s.catalog.length === 0 && !s.catalogError) {
            loadCatalog(provider);
        }
        loadLines(provider);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provider]);

    /* ── 30s polling refresh of lines for the active tab ────────── */

    useEffect(() => {
        const t = setInterval(() => {
            loadLines(provider, { silent: true });
        }, REFRESH_MS);
        return () => clearInterval(t);
    }, [provider, loadLines]);

    /* ── Filter / page change ───────────────────────────────────── */

    const onLinesChange = useCallback(
        (next: {
            readonly search?: string;
            readonly statusFilter?: StatusFilter;
            readonly page?: number;
        }) => {
            setStates((prev) => {
                const cur = prev[provider];
                return {
                    ...prev,
                    [provider]: {
                        ...cur,
                        search: next.search ?? cur.search,
                        statusFilter: next.statusFilter ?? cur.statusFilter,
                        page: next.page ?? cur.page,
                    },
                };
            });
            // re-fetch on next tick (state may not be flushed yet)
            setTimeout(() => loadLines(provider), 0);
        },
        [provider, loadLines],
    );

    const current = states[provider];

    const onBuy = useCallback((product: IptvProductLike) => {
        setCheckoutProduct(product);
    }, []);

    const onCheckoutSuccess = useCallback(() => {
        loadLines(provider);
    }, [provider, loadLines]);

    const onDetailChanged = useCallback(() => {
        loadLines(provider);
    }, [provider, loadLines]);

    const providerLabel = useMemo(
        () => PROVIDER_BADGES[provider]?.label ?? provider,
        [provider],
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <ShopTopNav />

            {/* Header */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center size-10 rounded-xl bg-[#FACC15]/10 border border-[#FACC15]/30 text-[#FACC15]">
                        <Tv size={20} />
                    </span>
                    <div>
                        <h1 className="text-3xl lg:text-4xl font-black bg-gradient-to-r from-[#FACC15] to-amber-200 bg-clip-text text-transparent tracking-tight">
                            Gestion IPTV
                        </h1>
                        <p className="text-sm text-slate-400">
                            Vos lignes vendues, par fournisseur. Achat + gestion
                            en un seul endroit.
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <Tabs
                aria-label="Fournisseurs IPTV"
                selectedKey={provider}
                onSelectionChange={handleTabChange}
                size="lg"
                variant="solid"
                classNames={{
                    tabList:
                        "bg-[#0f0f0f] border border-[#262626] rounded-xl p-1 gap-1",
                    cursor: "bg-[#FACC15] rounded-lg shadow-none",
                    tab: "h-10 px-4 data-[selected=true]:text-black text-slate-400",
                    tabContent:
                        "group-data-[selected=true]:text-black font-black text-sm",
                }}
            >
                {PROVIDERS.map((p) => (
                    <Tab key={p} title={PROVIDER_BADGES[p]?.label ?? p} />
                ))}
            </Tabs>

            {/* SECTION A — Acheter */}
            <section className="bg-[#0f0f0f] border border-[#262626] rounded-2xl overflow-hidden">
                <button
                    type="button"
                    onClick={() => setCatalogOpen((s) => !s)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#161616] transition-colors"
                >
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-base font-black text-white">
                            Acheter
                        </h2>
                        <span className="text-xs text-slate-500">
                            Catalogue {providerLabel}
                        </span>
                    </div>
                    <ChevronDown
                        size={16}
                        className={`text-slate-400 transition-transform ${catalogOpen ? "rotate-180" : ""}`}
                    />
                </button>
                {catalogOpen && (
                    <div className="px-5 pb-5">
                        {current.isLoadingCatalog ? (
                            <div className="py-12 flex justify-center">
                                <Spinner color="warning" />
                            </div>
                        ) : current.catalogError ? (
                            <p className="text-center text-amber-400 italic py-10">
                                {current.catalogError}
                            </p>
                        ) : current.catalog.length === 0 ? (
                            <p className="text-center text-slate-500 italic py-10">
                                Aucun produit disponible pour {providerLabel}.
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {current.catalog.map((p) => (
                                    <IptvCatalogCard
                                        key={p.id}
                                        product={p}
                                        onBuy={onBuy}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </section>

            {/* SECTION B — Mes lignes */}
            <section className="bg-[#0f0f0f] border border-[#262626] rounded-2xl p-5 space-y-4">
                <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-base font-black text-white">
                            Mes lignes
                        </h2>
                        <span className="text-xs text-slate-500">
                            {providerLabel}
                        </span>
                    </div>
                </div>
                <IptvLinesTable
                    provider={provider}
                    items={current.items}
                    total={current.total}
                    page={current.page}
                    limit={LIMIT}
                    totalPages={current.totalPages}
                    search={current.search}
                    statusFilter={current.statusFilter}
                    isLoading={current.isLoadingItems}
                    onChange={onLinesChange}
                    onManage={(id) => setDetailOrderId(id)}
                />
            </section>

            {/* Modals */}
            <IptvCheckoutModal
                product={checkoutProduct}
                provider={provider}
                isOpen={!!checkoutProduct}
                onClose={() => setCheckoutProduct(null)}
                onSuccess={onCheckoutSuccess}
            />
            <IptvLineDetailModal
                iptvOrderId={detailOrderId}
                isOpen={!!detailOrderId}
                onClose={() => setDetailOrderId(null)}
                onChanged={onDetailChanged}
            />
        </div>
    );
}
