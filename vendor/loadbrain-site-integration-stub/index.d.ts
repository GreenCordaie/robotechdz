export interface LoadBrainConfig {
    apiKey: string;
    baseUrl: string;
    siteUrl: string;
    webhookSecret: string;
}

export declare function validateConfig(input: unknown): LoadBrainConfig;

export declare class LoadBrainClient {
    constructor(config: LoadBrainConfig);
    listProducts(): Promise<{ products: unknown[] }>;
    provisionProduct(slug: string, opts?: unknown): Promise<{ taskId: string; status: string }>;
    getTask(id: string): Promise<{ task: { id: string; status: string } }>;
    retryTask(id: string): Promise<{ taskId: string; status: string }>;
    cancelOrder(orderNumber: string): Promise<{ success: boolean }>;
    resendWebhook(taskId: string): Promise<{ success: boolean }>;
    getCredentialsByOrder(orderNumber: string): Promise<null | Record<string, unknown>>;
    renewSubscription(taskId: string): Promise<{ success: boolean; taskId: string; status: string }>;
}

type AnyHandler = (req: Request) => Promise<Response>;
export declare function createNextRouteHandler(config: LoadBrainConfig): {
    GET: AnyHandler;
    POST: AnyHandler;
    DELETE: AnyHandler;
    PUT: AnyHandler;
};
