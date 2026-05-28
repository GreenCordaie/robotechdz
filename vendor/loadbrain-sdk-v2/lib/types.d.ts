/**
 * v2 API unified envelope and request/response types.
 */
export interface ApiResponseMeta {
    page?: number;
    limit?: number;
    total?: number;
    requestId?: string;
    [key: string]: unknown;
}
export interface ApiResponseError {
    code: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
}
export interface ApiResponseSuccess<T> {
    success: true;
    data: T;
    error: null;
    meta?: ApiResponseMeta;
}
export interface ApiResponseFailure {
    success: false;
    data: null;
    error: ApiResponseError;
    meta?: ApiResponseMeta;
}
export type ApiResponse<T> = ApiResponseSuccess<T> | ApiResponseFailure;
export type BackoffStrategy = "expo" | "linear";
export interface RetryConfig {
    max: number;
    backoff: BackoffStrategy;
}
export interface ClientConfigApiKey {
    apiKey: string;
    bearerToken?: never;
    baseUrl: string;
    retry?: RetryConfig;
    timeoutMs?: number;
    fetch?: typeof fetch;
}
export interface ClientConfigBearer {
    bearerToken: string;
    apiKey?: never;
    baseUrl: string;
    retry?: RetryConfig;
    timeoutMs?: number;
    fetch?: typeof fetch;
}
/**
 * Client configuration. Exactly one of `apiKey` (tenant/X-API-Key mode) OR
 * `bearerToken` (admin/Bearer JWT mode) must be supplied.
 */
export type ClientConfig = ClientConfigApiKey | ClientConfigBearer;
export interface RequestOptions {
    idempotencyKey?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
}
export interface PaginationParams {
    page?: number;
    limit?: number;
}
export interface CatalogAggregateParams {
    modules: ReadonlyArray<"iptv" | "giftcards" | "marketplace">;
}
export interface CatalogAggregateResult {
    modules: Record<string, unknown>;
}
export interface IptvProduct {
    id: string;
    name: string;
    [key: string]: unknown;
}
export interface IptvApp {
    id: string;
    name: string;
    [key: string]: unknown;
}
export interface IptvProductsListParams extends PaginationParams {
    app?: string;
}
export interface GiftCard {
    sku: string;
    name: string;
    category?: string;
    [key: string]: unknown;
}
export interface GiftCardsCatalogListParams extends PaginationParams {
    category?: string;
}
export interface GiftCardOrderCreateInput {
    /** Canonical LoadBrain SKU. Mutually exclusive with `listingId`. */
    sku?: string;
    /** BSV-mirror listing UUID — buy exactly that seller offer. Mutually exclusive with `sku`. */
    listingId?: string;
    quantity: number;
    externalOrderId: string;
    customerRef?: string;
    customerInfo?: Record<string, unknown>;
}
export interface GiftCardListingSearchParams {
    q?: string;
    brand?: string;
    category?: string;
    region?: string;
    deliveryType?: "auto" | "manual" | "all";
    priceMinUsd?: number;
    priceMaxUsd?: number;
    /** Single rank or CSV of accepted ranks. */
    sellerRank?: string | readonly string[];
    sortBy?: "price" | "score" | "newest";
    page?: number;
    limit?: number;
}
export interface GiftCardListingProduct {
    sku: string;
    brand: string;
    category: string;
    faceValue: string;
    faceUnit: string;
    region: string;
    displayName: string;
    imageUrl: string;
}
export interface GiftCardListingSeller {
    slug: string;
    rank: string | null;
    positiveReviews: number;
    negativeReviews: number;
}
export interface GiftCardListing {
    listingId: string;
    upstreamKey: string;
    encodedId: string | null;
    product: GiftCardListingProduct;
    seller: GiftCardListingSeller;
    priceCents: number;
    currency: string;
    deliveryType: "auto" | "manual";
    isApi: boolean;
    stockQty: number | null;
    score: number;
    rawTitle: string | null;
}
export interface GiftCardListingDetail extends GiftCardListing {
    liveQuote?: {
        priceCents: number;
        currency: string;
        available: boolean;
        source: "live" | "cached";
    };
}
export interface GiftCardListingSearchResult {
    items: ReadonlyArray<GiftCardListing>;
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export interface GiftCardOrder {
    id: string;
    status: string;
    sku: string;
    quantity: number;
    [key: string]: unknown;
}
export interface ProvisionTaskCreateInput {
    productId: string;
    quantity: number;
    externalOrderId: string;
}
export interface ProvisionTask {
    id: string;
    status: string;
    productId: string;
    quantity: number;
    [key: string]: unknown;
}
export interface ProvisionOrder {
    id: string;
    status: string;
    [key: string]: unknown;
}
export interface ProvisionOrderStatus {
    id: string;
    status: string;
    progress?: number;
    [key: string]: unknown;
}
export interface MarketplaceProduct {
    id: string;
    name: string;
    price?: number;
    [key: string]: unknown;
}
export interface MarketplaceOrderItemInput {
    productId: string;
    quantity: number;
}
export interface MarketplaceOrderCreateInput {
    items: ReadonlyArray<MarketplaceOrderItemInput>;
    externalOrderId: string;
}
export interface MarketplaceOrder {
    id: string;
    status: string;
    items: ReadonlyArray<MarketplaceOrderItemInput>;
    [key: string]: unknown;
}
/**
 * G2Bulk catalog product (snapshot row mirrored from upstream).
 * Money is in cents (integers).
 */
export interface G2BulkProduct {
    id: number;
    providerId: string;
    categoryId: number | null;
    title: string;
    description: string | null;
    imageUrl: string | null;
    unitPriceCents: number;
    currency: string;
    stock: number;
    isActive: boolean;
    [key: string]: unknown;
}
export interface G2BulkCategory {
    id: number;
    providerId: string;
    title: string;
    description: string | null;
    imageUrl: string | null;
    productCount: number;
    [key: string]: unknown;
}
export interface G2BulkProductsSearchParams {
    q?: string;
    categoryId?: number;
    priceMaxCents?: number;
    sortBy?: "price_asc" | "price_desc" | "title" | "newest";
    page?: number;
    limit?: number;
}
export interface G2BulkProductListResponse {
    items: ReadonlyArray<G2BulkProduct>;
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export interface G2BulkOrderInput {
    /** G2Bulk upstream product id (numeric — matches G2BulkProduct.id). */
    productId: number;
    quantity: number;
    /** Tenant-side unique order id — used for idempotency. */
    externalOrderId: string;
    /** Echoed back in webhooks. Customer email, order ref, etc. */
    customerRef?: string;
    customerInfo?: Record<string, unknown>;
}
/** POST /api/v2/g2bulk/orders response (immediate, before delivery). */
export interface G2BulkOrderResponse {
    orderId: string;
    status: "queued" | "processing" | "completed" | "failed" | "cancelled";
    isExisting: boolean;
    externalOrderId: string;
}
export interface G2BulkDeliveredCode {
    index: number;
    code: string;
    redemptionUrl?: string | null;
    pin?: string | null;
    expiresAt?: string | null;
}
/** GET /api/v2/g2bulk/orders/:orderId response. */
export interface G2BulkOrderDetail {
    order: {
        id: string;
        siteId: string;
        externalOrderId: string;
        productId: number;
        quantity: number;
        status: "queued" | "processing" | "completed" | "failed" | "cancelled";
        [key: string]: unknown;
    };
    codes: ReadonlyArray<G2BulkDeliveredCode>;
}
/**
 * Kinguin offer wholesale tier. `price_cents` is only attainable when the
 * parent offer has `wholesale.enabled === true` AND the buyer qualifies
 * for the tier — see KINGUIN-LIVE-PROBE.md §Pricing rule.
 */
export interface KinguinWholesaleTier {
    level: number;
    priceCents: number;
}
export interface KinguinOffer {
    offerId: string;
    merchantName: string | null;
    priceCents: number;
    availableQty: number | null;
    totalQty: number | null;
    isPreorder: boolean;
    wholesaleEnabled: boolean;
    wholesaleTiers: ReadonlyArray<KinguinWholesaleTier> | null;
}
export interface KinguinProduct {
    id: number;
    providerId: string;
    kinguinId: number;
    productId: string;
    name: string | null;
    description: string | null;
    imageUrl: string | null;
    regionalLimitations: string | null;
    regionId: string | null;
    cheapestOfferId: string | null;
    cheapestPriceCents: number | null;
    totalQty: number | null;
    offersCount: number | null;
    platform: string | null;
    genres: ReadonlyArray<string> | null;
    tags: ReadonlyArray<string> | null;
    vatAssumption: "unknown" | "included" | "excluded";
    updatedAt: string | null;
    [key: string]: unknown;
}
export interface KinguinProductsSearchParams {
    q?: string;
    priceMaxCents?: number;
    sortBy?: "price_asc" | "price_desc" | "name" | "newest";
    page?: number;
    limit?: number;
}
export interface KinguinProductListResponse {
    items: ReadonlyArray<KinguinProduct>;
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export interface KinguinProductDetail {
    product: KinguinProduct;
    offers: ReadonlyArray<KinguinOffer>;
}
export interface KinguinCategory {
    slug: string;
    label: string;
    source: "tag" | "genre";
    productCount: number;
}
export interface KinguinOrderCreateRequest {
    kinguinId: number;
    quantity: number;
    externalOrderId: string;
    /** EUR cents — tenant's max acceptable upstream cost. Price-gate threshold. */
    maxPriceCents: number;
    /** EUR cents — tenant's own sale price (audit only). */
    salePriceCents: number;
    /** Optional bias for which Kinguin merchant offer to buy from. */
    preferredOfferId?: string;
}
export type KinguinOrderStatus = "queued" | "processing" | "completed" | "failed" | "cancelled" | "refunded" | "pending_price_confirmation";
export interface KinguinOrder {
    orderId: string;
    status: KinguinOrderStatus;
    isExisting: boolean;
    externalOrderId: string;
    priceGateTriggered: boolean;
}
export interface KinguinDeliveredCode {
    index: number;
    code: string;
    codeType: "text" | "image_base64";
    redemptionUrl: string | null;
    expiresAt: string | null;
    deliveredAt: string;
}
export interface KinguinOrderDetail {
    order: {
        id: string;
        siteId: string;
        externalOrderId: string;
        kinguinId: number;
        offerId: string | null;
        quantity: number;
        salePriceCents: number;
        costPriceCents: number;
        currency: string;
        status: KinguinOrderStatus;
        upstreamOrderId: string | null;
        upstreamStatus: string | null;
        priceGateTriggered: boolean;
        error: string | null;
        completedAt: string | null;
        createdAt: string;
        [key: string]: unknown;
    };
    codes: ReadonlyArray<KinguinDeliveredCode>;
}
export interface KinguinOrderCodes {
    codes: ReadonlyArray<KinguinDeliveredCode>;
}
export interface KinguinReturnRequest {
    reason?: string;
}
export interface KinguinReturnResponse {
    ok: boolean;
    queued: boolean;
}
//# sourceMappingURL=types.d.ts.map