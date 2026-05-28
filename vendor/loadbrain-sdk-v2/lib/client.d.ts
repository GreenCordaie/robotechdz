import type { ClientConfig, RequestOptions, CatalogAggregateParams, CatalogAggregateResult, IptvProduct, IptvApp, IptvProductsListParams, GiftCard, GiftCardsCatalogListParams, GiftCardOrder, GiftCardOrderCreateInput, GiftCardListingDetail, GiftCardListingSearchParams, GiftCardListingSearchResult, ProvisionTask, ProvisionTaskCreateInput, ProvisionOrder, ProvisionOrderStatus, MarketplaceProduct, MarketplaceOrder, MarketplaceOrderCreateInput, PaginationParams, G2BulkProduct, G2BulkCategory, G2BulkProductsSearchParams, G2BulkProductListResponse, G2BulkOrderInput, G2BulkOrderResponse, G2BulkOrderDetail, KinguinCategory, KinguinOrder, KinguinOrderCreateRequest, KinguinOrderDetail, KinguinProductDetail, KinguinProductListResponse, KinguinProductsSearchParams, KinguinReturnRequest, KinguinReturnResponse } from "./types";
interface CallArgs {
    method: string;
    path: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined | null>;
    options?: RequestOptions;
}
export declare class LoadBrainClient {
    readonly catalog: CatalogNamespace;
    readonly iptv: IptvNamespace;
    readonly giftcards: GiftCardsNamespace;
    readonly provision: ProvisionNamespace;
    readonly marketplace: MarketplaceNamespace;
    readonly g2bulk: G2BulkNamespace;
    readonly kinguin: KinguinNamespace;
    private readonly apiKey;
    private readonly bearerToken;
    private readonly baseUrl;
    private readonly retry;
    private readonly timeoutMs;
    private readonly fetchImpl;
    constructor(config: ClientConfig);
    private call;
}
type CallFn = <T>(args: CallArgs) => Promise<T>;
declare class CatalogNamespace {
    private readonly call;
    constructor(call: CallFn);
    aggregate(params: CatalogAggregateParams, options?: RequestOptions): Promise<CatalogAggregateResult>;
}
declare class IptvProductsNamespace {
    private readonly call;
    constructor(call: CallFn);
    list(params?: IptvProductsListParams, options?: RequestOptions): Promise<ReadonlyArray<IptvProduct>>;
    get(id: string, options?: RequestOptions): Promise<IptvProduct>;
}
declare class IptvAppsNamespace {
    private readonly call;
    constructor(call: CallFn);
    list(options?: RequestOptions): Promise<ReadonlyArray<IptvApp>>;
}
declare class IptvNamespace {
    readonly products: IptvProductsNamespace;
    readonly apps: IptvAppsNamespace;
    constructor(call: CallFn);
}
declare class GiftCardsCatalogNamespace {
    private readonly call;
    constructor(call: CallFn);
    list(params?: GiftCardsCatalogListParams, options?: RequestOptions): Promise<ReadonlyArray<GiftCard>>;
}
declare class GiftCardsOrdersNamespace {
    private readonly call;
    constructor(call: CallFn);
    create(input: GiftCardOrderCreateInput, options?: RequestOptions): Promise<GiftCardOrder>;
    get(id: string, options?: RequestOptions): Promise<GiftCardOrder>;
}
declare class GiftCardsListingsNamespace {
    private readonly call;
    constructor(call: CallFn);
    search(params?: GiftCardListingSearchParams, options?: RequestOptions): Promise<GiftCardListingSearchResult>;
    get(listingId: string, opts?: {
        includeLiveQuote?: boolean;
    }, options?: RequestOptions): Promise<GiftCardListingDetail>;
}
declare class GiftCardsNamespace {
    readonly catalog: GiftCardsCatalogNamespace;
    readonly orders: GiftCardsOrdersNamespace;
    readonly listings: GiftCardsListingsNamespace;
    constructor(call: CallFn);
}
declare class ProvisionTasksNamespace {
    private readonly call;
    constructor(call: CallFn);
    create(input: ProvisionTaskCreateInput, options?: RequestOptions): Promise<ProvisionTask>;
    get(id: string, options?: RequestOptions): Promise<ProvisionTask>;
    retry(id: string, options?: RequestOptions): Promise<ProvisionTask>;
    resendWebhook(id: string, options?: RequestOptions): Promise<{
        delivered: boolean;
    }>;
}
declare class ProvisionOrdersNamespace {
    private readonly call;
    constructor(call: CallFn);
    get(id: string, options?: RequestOptions): Promise<ProvisionOrder>;
    status(id: string, options?: RequestOptions): Promise<ProvisionOrderStatus>;
    cancel(id: string, options?: RequestOptions): Promise<ProvisionOrder>;
}
declare class ProvisionNamespace {
    readonly tasks: ProvisionTasksNamespace;
    readonly orders: ProvisionOrdersNamespace;
    constructor(call: CallFn);
}
declare class MarketplaceProductsNamespace {
    private readonly call;
    constructor(call: CallFn);
    list(params?: PaginationParams, options?: RequestOptions): Promise<ReadonlyArray<MarketplaceProduct>>;
    get(id: string, options?: RequestOptions): Promise<MarketplaceProduct>;
}
declare class MarketplaceOrdersNamespace {
    private readonly call;
    constructor(call: CallFn);
    create(input: MarketplaceOrderCreateInput, options?: RequestOptions): Promise<MarketplaceOrder>;
    get(id: string, options?: RequestOptions): Promise<MarketplaceOrder>;
}
declare class MarketplaceNamespace {
    readonly products: MarketplaceProductsNamespace;
    readonly orders: MarketplaceOrdersNamespace;
    constructor(call: CallFn);
}
declare class G2BulkProductsNamespace {
    private readonly call;
    constructor(call: CallFn);
    search(params?: G2BulkProductsSearchParams, options?: RequestOptions): Promise<G2BulkProductListResponse>;
    get(id: number, options?: RequestOptions): Promise<{
        product: G2BulkProduct;
    }>;
}
declare class G2BulkCategoriesNamespace {
    private readonly call;
    constructor(call: CallFn);
    list(options?: RequestOptions): Promise<{
        items: ReadonlyArray<G2BulkCategory>;
    }>;
}
declare class G2BulkOrdersNamespace {
    private readonly call;
    constructor(call: CallFn);
    create(input: G2BulkOrderInput, options?: RequestOptions): Promise<G2BulkOrderResponse>;
    get(orderId: string, options?: RequestOptions): Promise<G2BulkOrderDetail>;
}
declare class G2BulkNamespace {
    readonly products: G2BulkProductsNamespace;
    readonly categories: G2BulkCategoriesNamespace;
    readonly orders: G2BulkOrdersNamespace;
    constructor(call: CallFn);
}
declare class KinguinProductsNamespace {
    private readonly call;
    constructor(call: CallFn);
    search(params?: KinguinProductsSearchParams, options?: RequestOptions): Promise<KinguinProductListResponse>;
    get(kinguinId: number, options?: RequestOptions): Promise<KinguinProductDetail>;
}
declare class KinguinCategoriesNamespace {
    private readonly call;
    constructor(call: CallFn);
    list(options?: RequestOptions): Promise<{
        items: ReadonlyArray<KinguinCategory>;
    }>;
}
declare class KinguinOrdersNamespace {
    private readonly call;
    constructor(call: CallFn);
    create(input: KinguinOrderCreateRequest, options?: RequestOptions): Promise<KinguinOrder>;
    get(orderId: string, options?: RequestOptions): Promise<KinguinOrderDetail>;
    returnKeys(orderId: string, input?: KinguinReturnRequest, options?: RequestOptions): Promise<KinguinReturnResponse>;
}
declare class KinguinNamespace {
    readonly products: KinguinProductsNamespace;
    readonly categories: KinguinCategoriesNamespace;
    readonly orders: KinguinOrdersNamespace;
    constructor(call: CallFn);
}
export {};
//# sourceMappingURL=client.d.ts.map