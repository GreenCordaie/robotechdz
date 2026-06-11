"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoadBrainClient = void 0;
const transport_1 = require("./transport");
const DEFAULT_TIMEOUT_MS = 8000;
class LoadBrainClient {
    catalog;
    iptv;
    giftcards;
    provision;
    marketplace;
    g2bulk;
    kinguin;
    apiKey;
    bearerToken;
    baseUrl;
    retry;
    timeoutMs;
    fetchImpl;
    constructor(config) {
        const hasApiKey = Boolean(config.apiKey);
        const hasBearer = Boolean(config.bearerToken);
        if (hasApiKey && hasBearer) {
            throw new Error("LoadBrainClient: provide either apiKey OR bearerToken, not both");
        }
        if (!hasApiKey && !hasBearer) {
            throw new Error("LoadBrainClient: one of apiKey or bearerToken is required");
        }
        if (!config.baseUrl) {
            throw new Error("LoadBrainClient: baseUrl is required");
        }
        this.apiKey = config.apiKey;
        this.bearerToken = config.bearerToken;
        this.baseUrl = config.baseUrl;
        this.retry = config.retry;
        this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.fetchImpl = config.fetch ?? ((...args) => fetch(...args));
        this.catalog = new CatalogNamespace(this.call.bind(this));
        this.iptv = new IptvNamespace(this.call.bind(this));
        this.giftcards = new GiftCardsNamespace(this.call.bind(this));
        this.provision = new ProvisionNamespace(this.call.bind(this));
        this.marketplace = new MarketplaceNamespace(this.call.bind(this));
        this.g2bulk = new G2BulkNamespace(this.call.bind(this));
        this.kinguin = new KinguinNamespace(this.call.bind(this));
    }
    call(args) {
        return (0, transport_1.request)({
            baseUrl: this.baseUrl,
            apiKey: this.apiKey,
            bearerToken: this.bearerToken,
            method: args.method,
            path: args.path,
            body: args.body,
            query: args.query,
            idempotencyKey: args.options?.idempotencyKey,
            retry: this.retry,
            timeoutMs: args.options?.timeoutMs ?? this.timeoutMs,
            signal: args.options?.signal,
            fetchImpl: this.fetchImpl,
        });
    }
}
exports.LoadBrainClient = LoadBrainClient;
// --- Namespaces ---
class CatalogNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    aggregate(params, options) {
        return this.call({
            method: "GET",
            path: "/api/v2/catalog/aggregate",
            query: { modules: params.modules.join(",") },
            options,
        });
    }
}
class IptvProductsNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    list(params = {}, options) {
        return this.call({
            method: "GET",
            path: "/api/v2/iptv/products",
            query: { page: params.page, limit: params.limit, app: params.app },
            options,
        });
    }
    get(id, options) {
        return this.call({
            method: "GET",
            path: `/api/v2/iptv/products/${encodeURIComponent(id)}`,
            options,
        });
    }
}
class IptvAppsNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    list(options) {
        return this.call({
            method: "GET",
            path: "/api/v2/iptv/apps",
            options,
        });
    }
}
class IptvNamespace {
    products;
    apps;
    constructor(call) {
        this.products = new IptvProductsNamespace(call);
        this.apps = new IptvAppsNamespace(call);
    }
}
class GiftCardsCatalogNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    list(params = {}, options) {
        return this.call({
            method: "GET",
            path: "/api/v2/giftcards/catalog",
            query: { page: params.page, limit: params.limit, category: params.category },
            options,
        });
    }
}
class GiftCardsOrdersNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    create(input, options) {
        return this.call({
            method: "POST",
            path: "/api/v2/giftcards/orders",
            body: input,
            options,
        });
    }
    get(id, options) {
        return this.call({
            method: "GET",
            path: `/api/v2/giftcards/orders/${encodeURIComponent(id)}`,
            options,
        });
    }
}
class GiftCardsListingsNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    search(params = {}, options) {
        const sellerRank = Array.isArray(params.sellerRank)
            ? params.sellerRank.join(",")
            : params.sellerRank;
        return this.call({
            method: "GET",
            path: "/api/v2/giftcards/listings/search",
            query: {
                q: params.q,
                brand: params.brand,
                category: params.category,
                region: params.region,
                deliveryType: params.deliveryType,
                priceMinUsd: params.priceMinUsd,
                priceMaxUsd: params.priceMaxUsd,
                sellerRank,
                sortBy: params.sortBy,
                page: params.page,
                limit: params.limit,
            },
            options,
        });
    }
    get(listingId, opts, options) {
        return this.call({
            method: "GET",
            path: `/api/v2/giftcards/listings/${encodeURIComponent(listingId)}`,
            query: opts?.includeLiveQuote ? { includeLiveQuote: "true" } : undefined,
            options,
        });
    }
}
class GiftCardsNamespace {
    catalog;
    orders;
    listings;
    constructor(call) {
        this.catalog = new GiftCardsCatalogNamespace(call);
        this.orders = new GiftCardsOrdersNamespace(call);
        this.listings = new GiftCardsListingsNamespace(call);
    }
}
class ProvisionTasksNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    create(input, options) {
        return this.call({
            method: "POST",
            path: "/api/v2/provision/tasks",
            body: input,
            options,
        });
    }
    get(id, options) {
        return this.call({
            method: "GET",
            path: `/api/v2/provision/tasks/${encodeURIComponent(id)}`,
            options,
        });
    }
    retry(id, options) {
        return this.call({
            method: "POST",
            path: `/api/v2/provision/tasks/${encodeURIComponent(id)}/retry`,
            options,
        });
    }
    resendWebhook(id, options) {
        return this.call({
            method: "POST",
            path: `/api/v2/provision/tasks/${encodeURIComponent(id)}/resend-webhook`,
            options,
        });
    }
}
class ProvisionOrdersNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    get(id, options) {
        return this.call({
            method: "GET",
            path: `/api/v2/provision/orders/${encodeURIComponent(id)}`,
            options,
        });
    }
    status(id, options) {
        return this.call({
            method: "GET",
            path: `/api/v2/provision/orders/${encodeURIComponent(id)}/status`,
            options,
        });
    }
    cancel(id, options) {
        return this.call({
            method: "POST",
            path: `/api/v2/provision/orders/${encodeURIComponent(id)}/cancel`,
            options,
        });
    }
}
class ProvisionNamespace {
    tasks;
    orders;
    constructor(call) {
        this.tasks = new ProvisionTasksNamespace(call);
        this.orders = new ProvisionOrdersNamespace(call);
    }
}
class MarketplaceProductsNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    list(params = {}, options) {
        return this.call({
            method: "GET",
            path: "/api/v2/marketplace/products",
            query: { page: params.page, limit: params.limit },
            options,
        });
    }
    get(id, options) {
        return this.call({
            method: "GET",
            path: `/api/v2/marketplace/products/${encodeURIComponent(id)}`,
            options,
        });
    }
}
class MarketplaceOrdersNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    create(input, options) {
        return this.call({
            method: "POST",
            path: "/api/v2/marketplace/orders",
            body: input,
            options,
        });
    }
    get(id, options) {
        return this.call({
            method: "GET",
            path: `/api/v2/marketplace/orders/${encodeURIComponent(id)}`,
            options,
        });
    }
}
class MarketplaceNamespace {
    products;
    orders;
    constructor(call) {
        this.products = new MarketplaceProductsNamespace(call);
        this.orders = new MarketplaceOrdersNamespace(call);
    }
}
class G2BulkProductsNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    search(params = {}, options) {
        return this.call({
            method: "GET",
            path: "/api/v2/g2bulk/products/search",
            query: {
                q: params.q,
                categoryId: params.categoryId,
                priceMaxCents: params.priceMaxCents,
                sortBy: params.sortBy,
                page: params.page,
                limit: params.limit,
            },
            options,
        });
    }
    get(id, options) {
        return this.call({
            method: "GET",
            path: `/api/v2/g2bulk/products/${encodeURIComponent(String(id))}`,
            options,
        });
    }
}
class G2BulkCategoriesNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    list(options) {
        return this.call({
            method: "GET",
            path: "/api/v2/g2bulk/categories",
            options,
        });
    }
}
class G2BulkOrdersNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    create(input, options) {
        return this.call({
            method: "POST",
            path: "/api/v2/g2bulk/orders",
            body: input,
            options,
        });
    }
    get(orderId, options) {
        return this.call({
            method: "GET",
            path: `/api/v2/g2bulk/orders/${encodeURIComponent(orderId)}`,
            options,
        });
    }
}
class G2BulkNamespace {
    products;
    categories;
    orders;
    constructor(call) {
        this.products = new G2BulkProductsNamespace(call);
        this.categories = new G2BulkCategoriesNamespace(call);
        this.orders = new G2BulkOrdersNamespace(call);
    }
}
// --- Kinguin namespaces ---------------------------------------------------
class KinguinProductsNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    search(params = {}, options) {
        return this.call({
            method: "GET",
            path: "/api/v2/kinguin/products/search",
            query: {
                q: params.q,
                priceMaxCents: params.priceMaxCents,
                sortBy: params.sortBy,
                page: params.page,
                limit: params.limit,
            },
            options,
        });
    }
    get(kinguinId, options) {
        return this.call({
            method: "GET",
            path: `/api/v2/kinguin/products/${encodeURIComponent(String(kinguinId))}`,
            options,
        });
    }
}
class KinguinCategoriesNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    list(options) {
        return this.call({
            method: "GET",
            path: "/api/v2/kinguin/categories",
            options,
        });
    }
}
class KinguinOrdersNamespace {
    call;
    constructor(call) {
        this.call = call;
    }
    create(input, options) {
        return this.call({
            method: "POST",
            path: "/api/v2/kinguin/orders",
            body: input,
            options,
        });
    }
    get(orderId, options) {
        return this.call({
            method: "GET",
            path: `/api/v2/kinguin/orders/${encodeURIComponent(orderId)}`,
            options,
        });
    }
    returnKeys(orderId, input = {}, options) {
        return this.call({
            method: "POST",
            path: `/api/v2/kinguin/orders/${encodeURIComponent(orderId)}/return`,
            body: input,
            options,
        });
    }
}
class KinguinNamespace {
    products;
    categories;
    orders;
    constructor(call) {
        this.products = new KinguinProductsNamespace(call);
        this.categories = new KinguinCategoriesNamespace(call);
        this.orders = new KinguinOrdersNamespace(call);
    }
}
//# sourceMappingURL=client.js.map