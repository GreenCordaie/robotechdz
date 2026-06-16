import { pgTable, serial, text, timestamp, numeric, integer, boolean, jsonb, pgEnum, index, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { OrderStatus, UserRole, ClientActionType, DeliveryMethod, SupplierTransactionType, DigitalCodeStatus, DigitalCodeSlotStatus, OrderSource } from "@/lib/constants";
import { encryptedText } from "./encrypted-column";

export const orderStatusEnum = pgEnum("order_status", Object.values(OrderStatus) as [string, ...string[]]);
export const userRoleEnum = pgEnum("user_role", Object.values(UserRole) as [string, ...string[]]);
export const actionTypeEnum = pgEnum("action_type", Object.values(ClientActionType) as [string, ...string[]]);
export const deliveryMethodEnum = pgEnum("delivery_method", Object.values(DeliveryMethod) as [string, ...string[]]);
export const supplierTransactionTypeEnum = pgEnum("supplier_transaction_type", Object.values(SupplierTransactionType) as [string, ...string[]]);
export const digitalCodeStatusEnum = pgEnum("digital_code_status", Object.values(DigitalCodeStatus) as [string, ...string[]]);
export const digitalCodeSlotStatusEnum = pgEnum("digital_code_slot_status", Object.values(DigitalCodeSlotStatus) as [string, ...string[]]);
export const orderSourceEnum = pgEnum("order_source", Object.values(OrderSource) as [string, ...string[]]);

export const categories = pgTable("categories", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon"), // ex: 'streaming', 'gaming'
    imageUrl: text("image_url"),
});

export const products = pgTable("products", {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    requiresPlayerId: boolean("requires_player_id").default(false).notNull(),
    isManualDelivery: boolean("is_manual_delivery").default(true).notNull(),
    status: text("status").default("ACTIVE").notNull(), // 'ACTIVE' or 'ARCHIVED'
    tutorialText: text("tutorial_text"),
}, (table) => {
    return {
        categoryIdIdx: index("products_category_id_idx").on(table.categoryId),
        nameIdx: index("products_name_idx").on(table.name),
    };
});

export const productVariants = pgTable("product_variants", {
    id: serial("id").primaryKey(),
    productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // ex: '1 Mois', '3 Mois'
    salePriceDzd: numeric("sale_price_dzd", { precision: 10, scale: 2 }).notNull(),
    stockStatus: boolean("stock_status").default(true),
    isSharing: boolean("is_sharing").default(false).notNull(),
    totalSlots: integer("total_slots").default(1).notNull(),
    loadbrainSlug: text("loadbrain_slug"), // ex: "iptv-12m" → mappe vers plan LoadBrain
    kioskVisible: boolean("kiosk_visible").notNull().default(true),
    // EPIC 1 — Marketplace B2B
    resellerVisible: boolean("reseller_visible").notNull().default(true),
    resellerPriceOverrideDzd: numeric("reseller_price_override_dzd", { precision: 10, scale: 2 }),
}, (table) => {
    return {
        productIdIdx: index("product_id_idx").on(table.productId),
    };
});

export const suppliers = pgTable("suppliers", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    balance: numeric("balance", { precision: 12, scale: 2 }).default("0"),
    currency: text("currency").default("DZD"), // 'USD', 'EUR', 'DZD'
    status: text("status").default("ACTIVE").notNull(), // 'ACTIVE' or 'INACTIVE'
    // External balance tracking (migration 0024). INTERNAL_STOCK keeps the
    // legacy behavior; EXTERNAL_API rows are auto-refreshed by the cron and
    // surface low-balance alerts on /admin/fournisseurs.
    type: text("type").default("INTERNAL_STOCK").notNull(), // 'INTERNAL_STOCK' | 'EXTERNAL_API'
    providerKind: text("provider_kind"), // 'capsolver' | 'twocaptcha' | 'anticaptcha' | 'mudfish' | 'lb_bsv' | 'lb_g2bulk' | 'lb_kinguin' | 'lb_ironmax' | ...
    externalConfig: jsonb("external_config").$type<{
        endpoint?: string;
        apiKeyEnv?: string;     // name of env var holding the secret (never store the secret itself here)
        refreshIntervalS?: number;
        notes?: string;
    } | null>(),
    alertThreshold: numeric("alert_threshold", { precision: 12, scale: 2 }),
    lastBalanceAt: timestamp("last_balance_at", { mode: "date" }),
}, (table) => ({
    typeIdx: index("suppliers_type_idx").on(table.type),
    // Partial index (mirrors migration 0024). Declared here so drizzle-kit is
    // aware of it and won't drop it on the next generate.
    lastBalanceIdx: index("suppliers_last_balance_idx")
        .on(table.lastBalanceAt)
        .where(sql`type = 'EXTERNAL_API'`),
}));

export const clients = pgTable("clients", {
    id: serial("id").primaryKey(),
    nomComplet: text("nom_complet").notNull(),
    telephone: text("telephone"),
    totalDetteDzd: numeric("total_dette_dzd", { precision: 12, scale: 2 }).default("0"),
    totalSpentDzd: numeric("total_spent_dzd", { precision: 12, scale: 2 }).default("0"),
    loyaltyPoints: integer("loyalty_points").default(0).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
})

export const orders = pgTable("orders", {
    id: serial("id").primaryKey(),
    orderNumber: text("order_number").notNull().unique(),
    status: orderStatusEnum("status").default("EN_ATTENTE").notNull(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    remise: numeric("remise", { precision: 12, scale: 2 }).default("0"),
    montantPaye: numeric("montant_paye", { precision: 12, scale: 2 }).default("0"),
    resteAPayer: numeric("reste_a_payer", { precision: 12, scale: 2 }).default("0"),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    resellerId: integer("reseller_id").references(() => resellers.id, { onDelete: "set null" }),
    source: orderSourceEnum("source").default("KIOSK").notNull(),
    deliveryMethod: deliveryMethodEnum("delivery_method").default("TICKET").notNull(),
    customerPhone: text("customer_phone"),
    paymentMethod: text("payment_method"),
    returnRequest: jsonb("return_request").$type<import("@/lib/constants").ReturnRequest | null>().default(null),
    printStatus: text("print_status").default("not_required"), // 'not_required' | 'print_pending' | 'printed' | 'failed'
    isDelivered: boolean("is_delivered").default(false),
    whatsappSentAt: timestamp("whatsapp_sent_at", { mode: 'date' }),
    pointsEarned: integer("points_earned").default(0).notNull(),
    totalClientDebt: numeric("total_client_debt", { precision: 12, scale: 2 }).default("0"),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
}, (table) => {
    return {
        createdAtIdx: index("orders_created_at_idx").on(table.createdAt),
        statusIdx: index("orders_status_idx").on(table.status),
        clientIdIdx: index("orders_client_id_idx").on(table.clientId),
        // Partial index for B2C scans (reseller_id IS NULL).
        // Almost every B2C query filters with isNull(orders.resellerId);
        // this avoids full-filter on the table once it grows.
        // Ops: run `drizzle-kit generate` (or apply manual DDL) to materialize.
        ordersB2cCreatedIdx: index("orders_b2c_created_idx")
            .on(table.createdAt)
            .where(sql`reseller_id IS NULL`),
    };
});

export const orderItems = pgTable("order_items", {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
    variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "set null" }).notNull(),
    name: text("name").notNull(),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull(),
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }), // Historical cost
    purchaseCurrency: text("purchase_currency"),
    customData: text("custom_data"),
    playerNickname: text("player_nickname"),
}, (table) => {
    return {
        orderIdIdx: index("oi_order_id_idx").on(table.orderId),
    };
});

export const digitalCodes = pgTable("digital_codes", {
    id: serial("id").primaryKey(),
    variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "cascade" }).notNull(),
    code: text("code").notNull(),
    outlookPassword: text("outlook_password"), // Encrypted outlook password
    isRelayed: boolean("is_relayed").default(false).notNull(),
    status: digitalCodeStatusEnum("status").default("DISPONIBLE").notNull(),
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }), // Cost of the account
    purchaseCurrency: text("purchase_currency").default("DZD"),
    isDebitCompleted: boolean("is_debit_completed").default(false).notNull(),
    orderItemId: integer("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
    expiresAt: timestamp("expires_at", { mode: 'date' }),

    // Microsoft Graph Integration
    msRefreshToken: text("ms_refresh_token"), // Encrypted refresh token
    msStatus: text("ms_status").default("NONE"), // CONNECTED, EXPIRED, NONE
    msAccountEmail: text("ms_account_email"), // The Outlook/Hotmail email that authorized the app
    msClientId: text("ms_client_id"), // The Specific Azure Client ID used for this account
    msLastSync: timestamp("ms_last_sync", { mode: 'date' }),

    // Streaming deeplink — Netflix "Extra Member" (+1 stream) operator-side flag
    hasExtraMember: boolean("has_extra_member").default(false).notNull(),

}, (table) => {
    return {
        variantIdIdx: index("dc_variant_id_idx").on(table.variantId),
        statusIdx: index("dc_status_idx").on(table.status),
        orderItemIdIdx: index("dc_order_item_id_idx").on(table.orderItemId),
    };
});

export const digitalCodeSlots = pgTable("digital_code_slots", {
    id: serial("id").primaryKey(),
    digitalCodeId: integer("digital_code_id").references(() => digitalCodes.id, { onDelete: "cascade" }).notNull(),
    slotNumber: integer("slot_number").notNull(),
    profileName: text("profile_name"), // Custom label for this profile slot
    code: text("code"), // Specific PIN/Code for this slot
    status: digitalCodeSlotStatusEnum("status").default("DISPONIBLE").notNull(),
    orderItemId: integer("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
    expiresAt: timestamp("expires_at", { mode: 'date' }),
    // Denormalized streaming activation deeplink — set at slot assignment,
    // mirrors the canonical row in `slot_activation_tokens`. Lets the sync
    // WhatsApp delivery formatter include the link without a join.
    activationUrl: text("activation_url"),
    // Device quota (Option C hybrid — anti link-sharing). NULL = unlimited.
    // `devicesActivated` bumps on each new page session (debounced 60 min
    // on `lastDeviceAt`). When devicesActivated >= maxDevices, /activer page
    // returns 410 Gone.
    maxDevices: integer("max_devices"),
    devicesActivated: integer("devices_activated").default(0).notNull(),
    lastDeviceAt: timestamp("last_device_at", { mode: "date" }),
    // Set by POST /api/activer/[token]/request-code when the customer
    // presses "Voir mon code" — the watcher's OTP router prefers the
    // most recent click within a 60s window so concurrent slots on the
    // same master mailbox map to the right customer without needing a
    // profile name in the email body (Netflix doesn't send one).
    lastCodeRequestAt: timestamp("last_code_request_at", { mode: "date" }),
}, (table) => {
    return {
        digitalCodeIdIdx: index("dcs_digital_code_id_idx").on(table.digitalCodeId),
        statusIdx: index("dcs_status_idx").on(table.status),
        orderItemIdIdx: index("dcs_order_item_id_idx").on(table.orderItemId),
        devicesActivatedIdx: index("dcs_devices_activated_idx").on(table.devicesActivated),
    };
});

// ─── IPTV Provisioning (LoadBrain) ──────────────────────────────────────────
export const iptvProvisions = pgTable("iptv_provisions", {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
    orderItemId: integer("order_item_id").references(() => orderItems.id, { onDelete: "cascade" }).notNull(),
    variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    taskId: text("task_id").notNull(),
    loadbrainSlug: text("loadbrain_slug").notNull(),
    status: text("status").default("queued").notNull(), // queued | processing | completed | failed
    error: text("error"),
    errorCode: text("error_code"),
    credentialsEncrypted: text("credentials_encrypted"),
    completedAt: timestamp("completed_at", { mode: 'date' }),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
}, (table) => ({
    orderIdIdx: index("ip_order_id_idx").on(table.orderId),
    taskIdIdx: index("ip_task_id_idx").on(table.taskId),
    statusIdx: index("ip_status_idx").on(table.status),
}));

export const clientPayments = pgTable("client_payments", {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    montantDzd: numeric("montant_dzd", { precision: 12, scale: 2 }).notNull(),
    typeAction: actionTypeEnum("type_action").notNull(), // ACOMPTE, REMBOURSEMENT, RETOUR
    note: text("note"),
    receiptNumber: text("receipt_number").unique(),
    printStatus: text("print_status").default("not_required"),
    oldBalanceDzd: numeric("old_balance_dzd", { precision: 12, scale: 2 }),
    newBalanceDzd: numeric("new_balance_dzd", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
}, (table) => {
    return {
        clientIdIdx: index("cp_client_id_idx").on(table.clientId),
        orderIdIdx: index("cp_order_id_idx").on(table.orderId),
    };
});

export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    nom: text("nom").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    pinCode: text("pin_code").notNull(),
    role: userRoleEnum("role").default("CAISSIER").notNull(),
    avatarUrl: text("avatar_url"),
    twoFactorSecret: text("two_factor_secret"),
    mfaBackupCodes: text("mfa_backup_codes"), // Store as encrypted JSON array
    tokenVersion: integer("token_version").default(1).notNull(),
    lastActiveAt: timestamp("last_active_at", { mode: 'date' }).defaultNow(),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
});

export const shopSettings = pgTable("shop_settings", {
    id: serial("id").primaryKey(),
    shopName: text("shop_name").default("FLEXBOX DIRECT"),
    shopAddress: text("shop_address"),
    shopTel: text("shop_tel"),
    raisonSociale: text("raison_sociale"),
    ein: text("ein"),
    footerMessage: text("footer_message"),
    showCashierOnReceipt: boolean("show_cashier_on_receipt").default(true),
    showDateTimeOnReceipt: boolean("show_date_time_on_receipt").default(true),
    showLogoOnReceipt: boolean("show_logo_on_receipt").default(false),
    showTrackQrOnReceipt: boolean("show_track_qr_on_receipt").default(true),
    // Printer (USB ESC/POS)
    printerPaperWidth: integer("printer_paper_width").notNull().default(80),
    printerAutoCut: boolean("printer_auto_cut").notNull().default(true),
    printerAutoPrintPaid: boolean("printer_auto_print_paid").notNull().default(false),
    accentColor: text("accent_color").default("#ec5b13"),
    logoUrl: text("logo_url"),
    dashboardLogoUrl: text("dashboard_logo_url"),
    faviconUrl: text("favicon_url"),
    telegramBotToken: encryptedText("telegram_bot_token"),
    telegramChatId: text("telegram_chat_id"),
    telegramChatIdAdmin: text("telegram_chat_id_admin"),
    telegramChatIdCaisse: text("telegram_chat_id_caisse"),
    telegramChatIdTraiteur: text("telegram_chat_id_traiteur"),
    webhookUrl: text("webhook_url"),
    whatsappToken: encryptedText("whatsapp_token"),
    whatsappPhoneId: text("whatsapp_phone_id"),
    isB2bEnabled: boolean("is_b2b_enabled").default(false).notNull(),
    defaultResellerDiscount: numeric("default_reseller_discount", { precision: 5, scale: 2 }).default("5.00"),
    minResellerRecharge: numeric("min_reseller_recharge", { precision: 12, scale: 2 }).default("1000.00"),
    isMaintenanceMode: boolean("is_maintenance_mode").default(false).notNull(),
    allowedIps: text("allowed_ips"),
    whatsappApiUrl: text("whatsapp_api_url").default("http://localhost:3001"),
    whatsappApiKey: encryptedText("whatsapp_api_key"),
    whatsappInstanceName: text("whatsapp_instance_name").default("FLEXBOX_BOT"),
    // EPIC 2 / Phase A — Toggle global pour l'envoi auto WhatsApp post-paiement kiosk.
    // Default true = comportement historique préservé. False = le caissier doit
    // cliquer manuellement "Renvoyer WhatsApp" depuis le modal commande.
    autoSendWhatsapp: boolean("auto_send_whatsapp").notNull().default(true),
    whatsappSenderNumber: text("whatsapp_sender_number"),
    whatsappMessageTemplate: text("whatsapp_message_template"),
    chatbotEnabled: boolean("chatbot_enabled").default(false).notNull(),
    chatbotGreeting: text("chatbot_greeting"),
    whatsappWebhookUrl: text("whatsapp_webhook_url"),
    whatsappVerifyToken: encryptedText("whatsapp_verify_token"),
    geminiApiKey: encryptedText("gemini_api_key"),
    chatbotRole: text("chatbot_role"),
    n8nWebhookUrl: text("n8n_webhook_url"),
    usdExchangeRate: numeric("usd_exchange_rate", { precision: 10, scale: 2 }).default("245.00").notNull(),
    vapidPublicKey: text("vapid_public_key"),
    vapidPrivateKey: encryptedText("vapid_private_key"),
    stockAlertThreshold: integer("stock_alert_threshold").default(5).notNull(),
    netflixResolverEmail: text("netflix_resolver_email"),
    netflixResolverPassword: encryptedText("netflix_resolver_password"),
    microsoftClientId: text("microsoft_client_id"),
    microsoftTenantId: text("microsoft_tenant_id"),
    microsoftClientSecret: encryptedText("microsoft_client_secret"),
    microsoftRedirectUri: text("microsoft_redirect_uri"),
});

export const whatsappFaqs = pgTable("whatsapp_faqs", {
    id: serial("id").primaryKey(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
});

export const supplierTransactions = pgTable("supplier_transactions", {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "cascade" }).notNull(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    type: text("type").notNull(), // 'RECHARGE' or 'DEBIT' (simplified as per request)
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(), // 'DZD' or 'USD'
    reason: text("reason"),
    paymentStatus: text("payment_status").default("PAID").notNull(), // 'PAID', 'UNPAID'
    paidAt: timestamp("paid_at", { mode: 'date' }),
    exchangeRate: numeric("exchange_rate", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
}, (table) => {
    return {
        supplierIdIdx: index("st_supplier_id_idx").on(table.supplierId),
        orderIdIdx: index("st_order_id_idx").on(table.orderId),
        createdAtIdx: index("st_created_at_idx").on(table.createdAt),
    };
});

// EPIC 1 — Tier System (Bronze / Silver / Gold etc.)
// Discount appliqué EN PLUS du customDiscount éventuel sur reseller.
// minMonthlyVolumeDzd = volume d'achat mensuel requis pour atteindre ce tier.
export const resellerTiers = pgTable("reseller_tiers", {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(), // 'BRONZE', 'SILVER', 'GOLD', ...
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    minMonthlyVolumeDzd: numeric("min_monthly_volume_dzd", { precision: 12, scale: 2 }).notNull().default("0"),
    color: text("color").default("#94a3b8"), // hex pour badge UI
    isDefault: boolean("is_default").notNull().default(false), // tier auto-assigné aux nouveaux reseller
    rank: integer("rank").notNull().default(0), // ordre d'affichage / progression
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
});

export const resellers = pgTable("resellers", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    companyName: text("company_name").notNull(),
    contactPhone: text("contact_phone"),
    customDiscount: numeric("custom_discount", { precision: 5, scale: 2 }), // Override global discount
    status: text("status").default("ACTIVE").notNull(), // 'ACTIVE', 'SUSPENDED'
    // EPIC 1 — Tier system. NULL = tier par défaut (résolu côté service).
    tierId: integer("tier_id").references(() => resellerTiers.id, { onDelete: "set null" }),
    // EPIC 1 / Phase K — Préférences notif WhatsApp (opt-in/opt-out par event).
    // Shape : { "wallet.recharged": false, "order.confirmed": true, ... }
    // Si une clé manque → opt-in par défaut (true). Webhooks gèrent leurs events séparément.
    notificationPreferences: jsonb("notification_preferences").$type<Record<string, boolean>>().notNull().default({}),
    // Seuil d'alerte solde bas (DZD). NULL ou <= 0 → pas d'alerte (opt-in).
    // Quand un débit fait passer le solde sous ce seuil → notif wallet.low_balance (edge-triggered).
    lowBalanceThreshold: numeric("low_balance_threshold", { precision: 12, scale: 2 }),
    // White-label — branding shown to the RESELLER's own customers on the
    // public magic-link page (/activer/[token]). NULL = fall back to companyName
    // / operator defaults. The operator stays invisible to the end customer.
    brandName: text("brand_name"),
    brandColor: text("brand_color"), // accent hex, e.g. "#E50914"
    brandLogoUrl: text("brand_logo_url"), // reseller logo shown on the magic-link page
    supportPhone: text("support_phone"), // reseller's own customer-support number
    supportWhatsapp: text("support_whatsapp"), // reseller's WhatsApp (digits, e.g. 213xxxxxxxxx)
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
});

// EPIC 1 / Phase G — Outbound webhooks reseller.
// Permet aux revendeurs d'avoir leur propre app/bot qui écoute les events
// (order.paid, credentials.ready, wallet.recharged). HMAC-SHA256 signé.
export const resellerWebhooks = pgTable("reseller_webhooks", {
    id: serial("id").primaryKey(),
    resellerId: integer("reseller_id").references(() => resellers.id, { onDelete: "cascade" }).notNull(),
    url: text("url").notNull(),
    events: text("events").notNull(), // CSV : "order.paid,credentials.ready,wallet.recharged"
    secret: text("secret").notNull(), // signature HMAC-SHA256
    isActive: boolean("is_active").notNull().default(true),
    lastFiredAt: timestamp("last_fired_at", { mode: "date" }),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    deliveriesOk: integer("deliveries_ok").notNull().default(0),
    deliveriesFailed: integer("deliveries_failed").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => {
    return {
        resellerIdIdx: index("rw_reseller_id_idx").on(table.resellerId),
        isActiveIdx: index("rw_is_active_idx").on(table.isActive),
    };
});

// EPIC 1 / Phase L — Templates de notifications configurables par l'admin.
// PK = eventKey (clé du catalogue RESELLER_NOTIF_EVENTS, etc.). Si row absente,
// le service utilise le template par défaut hardcodé en fallback.
// Variables : `{{key}}` remplacé par la valeur du contexte au runtime.
export const notificationTemplates = pgTable("notification_templates", {
    eventKey: text("event_key").primaryKey(),
    body: text("body").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
});

// EPIC 1 / Phase L2 — Notification logs (audit + debug envois WhatsApp reseller).
// 1 row par appel safeSend() (success, fail, ou skip via pref opt-out).
// Rétention via cron quotidien (à wirer).
export const notificationLogs = pgTable("notification_logs", {
    id: serial("id").primaryKey(),
    eventKey: text("event_key").notNull(),
    channel: text("channel").notNull().default("whatsapp"), // futur : telegram, push
    resellerId: integer("reseller_id").references(() => resellers.id, { onDelete: "set null" }),
    contactPhone: text("contact_phone"),
    delivered: boolean("delivered").notNull(),
    reason: text("reason"), // si !delivered : "Désactivé par le reseller", "WhatsApp non configuré", "HTTP 401"…
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => {
    return {
        createdAtIdx: index("nl_created_at_idx").on(table.createdAt),
        eventKeyIdx: index("nl_event_key_idx").on(table.eventKey),
        resellerIdIdx: index("nl_reseller_id_idx").on(table.resellerId),
    };
});

// EPIC 1 / Phase G3 — Webhook DLQ.
// Retries persisted en DB (pas BullMQ) pour rester portable Node + Edge.
// Status flow : RETRYING (attempt < 5) → DEAD (attempt = 5, abandon) → RESOLVED (replay manuel admin OK).
// Le cron job /api/cron/webhook-retries pick les RETRYING dont nextAttemptAt <= now.
export const webhookDeliveryAttempts = pgTable("webhook_delivery_attempts", {
    id: serial("id").primaryKey(),
    webhookId: integer("webhook_id").references(() => resellerWebhooks.id, { onDelete: "cascade" }).notNull(),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { mode: "date" }),
    status: text("status").notNull().default("RETRYING"), // RETRYING | DEAD | RESOLVED
    lastError: text("last_error"),
    lastStatusCode: integer("last_status_code"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => {
    return {
        webhookIdIdx: index("wda_webhook_id_idx").on(table.webhookId),
        statusNextIdx: index("wda_status_next_idx").on(table.status, table.nextAttemptAt),
    };
});

// EPIC 1 / Phase E — Reseller signup public.
// Status PENDING (créé), APPROVED (user RESELLER + reseller + wallet créés),
// REJECTED (motif obligatoire). L'admin valide manuellement (Phase J UI).
export const resellerSignupRequests = pgTable("reseller_signup_requests", {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    companyName: text("company_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    nif: text("nif"), // Numéro d'identification fiscale (optionnel)
    rcNumber: text("rc_number"), // Registre du Commerce (optionnel)
    message: text("message"), // pourquoi devenir reseller (optionnel)
    status: text("status").notNull().default("PENDING"), // 'PENDING' | 'APPROVED' | 'REJECTED'
    rejectedReason: text("rejected_reason"),
    processedAt: timestamp("processed_at", { mode: "date" }),
    processedByUserId: integer("processed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdResellerId: integer("created_reseller_id").references(() => resellers.id, { onDelete: "set null" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => {
    return {
        statusIdx: index("rsr_status_idx").on(table.status),
        emailIdx: index("rsr_email_idx").on(table.email),
        createdAtIdx: index("rsr_created_at_idx").on(table.createdAt),
    };
});

export const resellerWallets = pgTable("reseller_wallets", {
    id: serial("id").primaryKey(),
    resellerId: integer("reseller_id").references(() => resellers.id, { onDelete: "cascade" }).notNull(),
    balance: numeric("balance", { precision: 12, scale: 2 }).default("0"),
    totalSpent: numeric("total_spent", { precision: 12, scale: 2 }).default("0"),
    updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow(),
});

export const resellerTransactions = pgTable("reseller_transactions", {
    id: serial("id").primaryKey(),
    walletId: integer("wallet_id").references(() => resellerWallets.id, { onDelete: "cascade" }).notNull(),
    type: text("type").notNull(), // 'RECHARGE', 'PURCHASE', 'REFUND'
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    description: text("description"),
    // Upstream origin tag — 'BSV' | 'G2BULK' | 'IPTV' | 'ACTIVE_CODE' | 'MANUAL'
    // | 'ADMIN_RECHARGE' | 'UPSTREAM_REFUND' | 'LEGACY'. Nullable for
    // back-compat with pre-0028 rows that may still be NULL.
    source: text("source"),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
}, (table) => {
    return {
        walletIdIdx: index("rt_wallet_id_idx").on(table.walletId),
        sourceIdx: index("rt_source_idx").on(table.source),
        walletCreatedIdx: index("rt_wallet_created_idx").on(table.walletId, table.createdAt),
    };
});

export const supportTickets = pgTable("support_tickets", {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    customerPhone: text("customer_phone"),
    status: text("status").default("OUVERT").notNull(), // 'OUVERT', 'RESOLU'
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow(),
}, (table) => {
    return {
        orderIdIdx: index("spt_order_id_idx").on(table.orderId),
        statusIdx: index("spt_status_idx").on(table.status),
    };
});

export const productVariantSuppliers = pgTable("product_variant_suppliers", {
    id: serial("id").primaryKey(),
    variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "cascade" }).notNull(),
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "cascade" }).notNull(),
    purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").default("USD").notNull(), // 'USD' or 'DZD'
}, (table) => {
    return {
        variantIdIdx: index("pvs_variant_id_idx").on(table.variantId),
        supplierIdIdx: index("pvs_supplier_id_idx").on(table.supplierId),
    };
});

export const auditLogs = pgTable("audit_logs", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // ex: 'UPDATE_PRICE', 'LOGIN_SUCCESS', 'WALLET_RECHARGE'
    entityType: text("entity_type"), // ex: 'PRODUCT', 'RESELLER', 'USER'
    entityId: text("entity_id"),
    oldData: jsonb("old_data"),
    newData: jsonb("new_data"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index("al_user_id_idx").on(table.userId),
        actionIdx: index("al_action_idx").on(table.action),
        createdAtIdx: index("al_created_at_idx").on(table.createdAt),
    };
});

export const pushSubscriptions = pgTable("push_subscriptions", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    subscription: jsonb("subscription").notNull(), // endpoint, keys { p256dh, auth }
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
}, (table) => {
    return {
        userIdIdx: index("ps_user_id_idx").on(table.userId),
    };
});

export const webhookEvents = pgTable("webhook_events", {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(), // 'telegram' or 'whatsapp'
    externalId: text("external_id").notNull(), // update_id or message_id
    customerPhone: text("customer_phone"), // Added for conversation history tracking
    payload: jsonb("payload"), // Added to store message content/metadata
    processedAt: timestamp("processed_at", { mode: 'date' }).defaultNow().notNull(),
}, (table) => {
    return {
        providerExternalIdIdx: index("webhook_provider_external_id_idx").on(table.provider, table.externalId),
        customerPhoneIdx: index("webhook_customer_phone_idx").on(table.customerPhone),
    };
});

export const rateLimits = pgTable("rate_limits", {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(), // ex: 'login:{email}' or 'mfa:{userId}'
    points: integer("points").default(0).notNull(),
    expiresAt: timestamp("expires_at", { mode: 'date' }).notNull(),
});

export const whatsappLidMapping = pgTable("whatsapp_lid_mapping", {
    lid: text("lid").primaryKey(),
    phone: text("phone").notNull(),
    clientName: text("client_name"),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
});

export const supportConversationMetadata = pgTable("support_conversation_metadata", {
    phone: text("phone").primaryKey(), // Canonical phone identifier
    lastSeenAt: timestamp("last_seen_at", { mode: 'date' }).defaultNow().notNull(),
});

export const partnerApiKeys = pgTable("partner_api_keys", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
    permissions: varchar("permissions", { length: 20 }).notNull().default("READ"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at"),
    callsThisMonth: integer("calls_this_month").notNull().default(0),
});

export const apiLogs = pgTable("api_logs", {
    id: serial("id").primaryKey(),
    apiKeyId: integer("api_key_id").notNull().references(() => partnerApiKeys.id),
    endpoint: varchar("endpoint", { length: 200 }).notNull(),
    method: varchar("method", { length: 10 }).notNull(),
    statusCode: integer("status_code").notNull(),
    responseTimeMs: integer("response_time_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const categoriesRelations = relations(categories, ({ many }) => ({
    products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
    category: one(categories, {
        fields: [products.categoryId],
        references: [categories.id],
    }),
    variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
    product: one(products, {
        fields: [productVariants.productId],
        references: [products.id],
    }),
    variantSuppliers: many(productVariantSuppliers),
    digitalCodes: many(digitalCodes),
}));

export const digitalCodesRelations = relations(digitalCodes, ({ one, many }) => ({
    variant: one(productVariants, {
        fields: [digitalCodes.variantId],
        references: [productVariants.id],
    }),
    orderItem: one(orderItems, {
        fields: [digitalCodes.orderItemId],
        references: [orderItems.id],
    }),
    slots: many(digitalCodeSlots),
}));


export const usersRelations = relations(users, ({ many }) => ({
    orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
    user: one(users, {
        fields: [orders.userId],
        references: [users.id],
    }),
    client: one(clients, {
        fields: [orders.clientId],
        references: [clients.id],
    }),
    reseller: one(resellers, {
        fields: [orders.resellerId],
        references: [resellers.id],
    }),
    items: many(orderItems),
    payments: many(clientPayments),
    tickets: many(supportTickets),
    iptvProvisions: many(iptvProvisions),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one }) => ({
    order: one(orders, {
        fields: [supportTickets.orderId],
        references: [orders.id],
    }),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
    order: one(orders, {
        fields: [orderItems.orderId],
        references: [orders.id],
    }),
    variant: one(productVariants, {
        fields: [orderItems.variantId],
        references: [productVariants.id],
    }),
    codes: many(digitalCodes),
    slots: many(digitalCodeSlots),
}));


export const digitalCodeSlotsRelations = relations(digitalCodeSlots, ({ one }) => ({
    digitalCode: one(digitalCodes, {
        fields: [digitalCodeSlots.digitalCodeId],
        references: [digitalCodes.id],
    }),
    orderItem: one(orderItems, {
        fields: [digitalCodeSlots.orderItemId],
        references: [orderItems.id],
    }),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
    transactions: many(supplierTransactions),
    links: many(productVariantSuppliers),
}));

export const supplierTransactionsRelations = relations(supplierTransactions, ({ one }) => ({
    supplier: one(suppliers, {
        fields: [supplierTransactions.supplierId],
        references: [suppliers.id],
    }),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
    orders: many(orders),
    payments: many(clientPayments),
}));

export const clientPaymentsRelations = relations(clientPayments, ({ one }) => ({
    client: one(clients, {
        fields: [clientPayments.clientId],
        references: [clients.id],
    }),
    order: one(orders, {
        fields: [clientPayments.orderId],
        references: [orders.id],
    }),
}));

export const productVariantSuppliersRelations = relations(productVariantSuppliers, ({ one }) => ({
    variant: one(productVariants, {
        fields: [productVariantSuppliers.variantId],
        references: [productVariants.id],
    }),
    supplier: one(suppliers, {
        fields: [productVariantSuppliers.supplierId],
        references: [suppliers.id],
    }),
}));

export const resellersRelations = relations(resellers, ({ one, many }) => ({
    user: one(users, {
        fields: [resellers.userId],
        references: [users.id],
    }),
    wallet: one(resellerWallets, {
        fields: [resellers.id],
        references: [resellerWallets.resellerId],
    }),
    tier: one(resellerTiers, {
        fields: [resellers.tierId],
        references: [resellerTiers.id],
    }),
    orders: many(orders),
}));

export const resellerTiersRelations = relations(resellerTiers, ({ many }) => ({
    resellers: many(resellers),
}));

export const resellerWalletsRelations = relations(resellerWallets, ({ one, many }) => ({
    reseller: one(resellers, {
        fields: [resellerWallets.resellerId],
        references: [resellers.id],
    }),
    transactions: many(resellerTransactions),
}));

export const resellerTransactionsRelations = relations(resellerTransactions, ({ one }) => ({
    wallet: one(resellerWallets, {
        fields: [resellerTransactions.walletId],
        references: [resellerWallets.id],
    }),
    order: one(orders, {
        fields: [resellerTransactions.orderId],
        references: [orders.id],
    }),
}));

// Removed split ordersRelationsB2b to merge with ordersRelations

export const iptvProvisionsRelations = relations(iptvProvisions, ({ one }) => ({
    order: one(orders, {
        fields: [iptvProvisions.orderId],
        references: [orders.id],
    }),
    orderItem: one(orderItems, {
        fields: [iptvProvisions.orderItemId],
        references: [orderItems.id],
    }),
    variant: one(productVariants, {
        fields: [iptvProvisions.variantId],
        references: [productVariants.id],
    }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
    user: one(users, {
        fields: [auditLogs.userId],
        references: [users.id],
    }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
    user: one(users, {
        fields: [pushSubscriptions.userId],
        references: [users.id],
    }),
}));

export const partnerApiKeysRelations = relations(partnerApiKeys, ({ many }) => ({
    logs: many(apiLogs),
}));

export const apiLogsRelations = relations(apiLogs, ({ one }) => ({
    apiKey: one(partnerApiKeys, {
        fields: [apiLogs.apiKeyId],
        references: [partnerApiKeys.id],
    }),
}));

// ---------------------------------------------------------------------------
// BSV Mirror Shop — pricing rules for listings sourced from LoadBrain/BSV
// ---------------------------------------------------------------------------
// Scope precedence at resolution time (most-specific wins):
//   sku > brand > category > global
// markup_type 'pct' stores basis points (1500 = 15%).
// markup_type 'fixed_dzd' stores absolute DZD added on top of the cost.
export const bsvPricingRules = pgTable("bsv_pricing_rules", {
    id: serial("id").primaryKey(),
    scopeType: text("scope_type").notNull(), // 'global' | 'category' | 'brand' | 'sku'
    scopeValue: text("scope_value").notNull(), // '*' for global, ex: 'gaming' | 'free-fire' | 'free-fire__110DIAMONDS__GLOBAL'
    markupType: text("markup_type").notNull(), // 'pct' | 'fixed_dzd'
    markupValue: numeric("markup_value", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
}, (table) => {
    return {
        scopeLookupIdx: index("bsv_pricing_rules_scope_lookup").on(table.scopeType, table.scopeValue),
    };
});

/* ----------------------------------------------------------------------
 * BSV Mirror Shop (Lot 3) — additive tables, no FK changes to existing ones
 * --------------------------------------------------------------------- */

export const bsvOrderStatusEnum = pgEnum("bsv_order_status", [
    "PENDING_LOADBRAIN",
    "COMPLETED",
    "FAILED",
    "REFUNDED",
]);

/**
 * Mirror-order: one row per reseller checkout of a BSV listing.
 * Linked to the local `orders` row (which handles the wallet debit) via
 * `localOrderId`, and to the LoadBrain order via `lbOrderId`.
 */
export const bsvOrders = pgTable("bsv_orders", {
    id: serial("id").primaryKey(),
    localOrderId: integer("local_order_id")
        .references(() => orders.id, { onDelete: "cascade" })
        .notNull(),
    resellerId: integer("reseller_id")
        .references(() => resellers.id, { onDelete: "cascade" })
        .notNull(),
    listingId: text("listing_id").notNull(),
    quantity: integer("quantity").notNull(),
    pricePaidDzd: numeric("price_paid_dzd", { precision: 12, scale: 2 }).notNull(),
    lbOrderId: text("lb_order_id"),
    status: bsvOrderStatusEnum("status").default("PENDING_LOADBRAIN").notNull(),
    /** Forensic snapshot from LoadBrain: seller, exact price, BSV tx, etc. */
    wonSnapshot: jsonb("won_snapshot").$type<unknown>(),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
    localOrderIdx: index("bsv_orders_local_order_idx").on(table.localOrderId),
    lbOrderIdx: index("bsv_orders_lb_order_idx").on(table.lbOrderId),
    resellerIdx: index("bsv_orders_reseller_idx").on(table.resellerId),
}));

export const bsvDeliveredCodes = pgTable("bsv_delivered_codes", {
    id: serial("id").primaryKey(),
    bsvOrderId: integer("bsv_order_id")
        .references(() => bsvOrders.id, { onDelete: "cascade" })
        .notNull(),
    /** Encrypted code (use lib/encryption.ts). */
    code: text("code").notNull(),
    redemptionUrl: text("redemption_url"),
    pin: text("pin"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
    bsvOrderIdx: index("bsv_delivered_codes_bsv_order_idx").on(table.bsvOrderId),
}));

export const bsvOrdersRelations = relations(bsvOrders, ({ one, many }) => ({
    localOrder: one(orders, {
        fields: [bsvOrders.localOrderId],
        references: [orders.id],
    }),
    reseller: one(resellers, {
        fields: [bsvOrders.resellerId],
        references: [resellers.id],
    }),
    codes: many(bsvDeliveredCodes),
}));

export const bsvDeliveredCodesRelations = relations(bsvDeliveredCodes, ({ one }) => ({
    bsvOrder: one(bsvOrders, {
        fields: [bsvDeliveredCodes.bsvOrderId],
        references: [bsvOrders.id],
    }),
}));

// ---------------------------------------------------------------------------
// G2Bulk Mirror Shop — pricing rules for products sourced from LoadBrain/G2Bulk
// ---------------------------------------------------------------------------
// Mirrors bsvPricingRules. Scope precedence at resolution time
// (most-specific wins): sku > brand > category > global.
// markup_type 'pct' stores basis points (1500 = 15%).
// markup_type 'fixed_dzd' stores absolute DZD added on top of cost.
export const g2bulkPricingRules = pgTable("g2bulk_pricing_rules", {
    id: serial("id").primaryKey(),
    scopeType: text("scope_type").notNull(), // 'global' | 'category' | 'brand' | 'sku'
    scopeValue: text("scope_value").notNull(), // '*' for global
    markupType: text("markup_type").notNull(), // 'pct' | 'fixed_dzd'
    markupValue: numeric("markup_value", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
}, (table) => {
    return {
        scopeLookupIdx: index("g2bulk_pricing_rules_scope_lookup").on(table.scopeType, table.scopeValue),
    };
});

/* ----------------------------------------------------------------------
 * G2Bulk Mirror Shop (Lot 3) — additive tables, mirrors bsv_orders/bsv_delivered_codes
 * --------------------------------------------------------------------- */

export const g2bulkOrderStatusEnum = pgEnum("g2bulk_order_status", [
    "PENDING_LOADBRAIN",
    "COMPLETED",
    "FAILED",
    "REFUNDED",
]);

/**
 * Mirror-order: one row per reseller checkout of a G2Bulk product.
 * Linked to the local `orders` row (wallet debit) via `localOrderId`,
 * and to the LoadBrain order via `lbOrderId`.
 */
export const g2bulkOrders = pgTable("g2bulk_orders", {
    id: serial("id").primaryKey(),
    localOrderId: integer("local_order_id")
        .references(() => orders.id, { onDelete: "cascade" })
        .notNull(),
    resellerId: integer("reseller_id")
        .references(() => resellers.id, { onDelete: "cascade" })
        .notNull(),
    productId: text("product_id").notNull(), // upstream G2Bulk product id (stringified)
    quantity: integer("quantity").notNull(),
    pricePaidDzd: numeric("price_paid_dzd", { precision: 12, scale: 2 }).notNull(),
    lbOrderId: text("lb_order_id"),
    status: g2bulkOrderStatusEnum("status").default("PENDING_LOADBRAIN").notNull(),
    /** Forensic snapshot from LoadBrain: provider, exact price, etc. */
    wonSnapshot: jsonb("won_snapshot").$type<unknown>(),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
    localOrderIdx: index("g2bulk_orders_local_order_idx").on(table.localOrderId),
    lbOrderIdx: index("g2bulk_orders_lb_order_idx").on(table.lbOrderId),
    resellerIdx: index("g2bulk_orders_reseller_idx").on(table.resellerId),
}));

export const g2bulkDeliveredCodes = pgTable("g2bulk_delivered_codes", {
    id: serial("id").primaryKey(),
    g2bulkOrderId: integer("g2bulk_order_id")
        .references(() => g2bulkOrders.id, { onDelete: "cascade" })
        .notNull(),
    /** Encrypted code (use lib/encryption.ts). */
    code: text("code").notNull(),
    redemptionUrl: text("redemption_url"),
    pin: text("pin"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
}, (table) => ({
    g2bulkOrderIdx: index("g2bulk_delivered_codes_g2bulk_order_idx").on(table.g2bulkOrderId),
}));

/**
 * activeCodeOrders — per-line tracking for Niveausat-backed purchases
 * placed via /reseller/shop/active-code. Mirrors the g2bulkOrders shape:
 * linked to a local `orders` row (wallet debit, reseller context) and to
 * the LoadBrain provisioning task on the side so the storefront can
 * resync status after the in-page polling window.
 */
export const activeCodeOrderStatusEnum = pgEnum("active_code_order_status", [
    "PENDING_LOADBRAIN",
    "DELIVERED",
    "FAILED",
    "REFUNDED",
]);

export const activeCodeOrders = pgTable("active_code_orders", {
    id: serial("id").primaryKey(),
    localOrderId: integer("local_order_id")
        .references(() => orders.id, { onDelete: "cascade" })
        .notNull(),
    resellerId: integer("reseller_id")
        .references(() => resellers.id, { onDelete: "cascade" })
        .notNull(),
    planId: text("plan_id").notNull(),
    planLabel: text("plan_label").notNull(),
    pricePaidDzd: numeric("price_paid_dzd", { precision: 12, scale: 2 }).notNull(),
    lbOrderId: text("lb_order_id").notNull(),
    lbTaskId: text("lb_task_id"),
    code: text("code"),
    status: activeCodeOrderStatusEnum("status")
        .notNull()
        .default("PENDING_LOADBRAIN"),
    error: text("error"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const activeCodeOrdersRelations = relations(activeCodeOrders, ({ one }) => ({
    localOrder: one(orders, {
        fields: [activeCodeOrders.localOrderId],
        references: [orders.id],
    }),
    reseller: one(resellers, {
        fields: [activeCodeOrders.resellerId],
        references: [resellers.id],
    }),
}));

/**
 * activeCodeRefundRequests — reseller-initiated refund requests for
 * delivered Active Code orders, gated behind admin approval.
 *
 * A reseller can request a refund on a DELIVERED active-code order. The
 * money is NOT credited until an ADMIN approves: on approval we credit
 * the reseller wallet (REFUND tx) + flip the order statuses, then make a
 * best-effort gateway call to return the code to LoadBrain stock with the
 * admin-chosen `reusable` flag.
 */
export const activeCodeRefundStatusEnum = pgEnum("active_code_refund_status", [
    "PENDING",
    "APPROVED",
    "REJECTED",
]);

export const activeCodeRefundRequests = pgTable("active_code_refund_requests", {
    id: serial("id").primaryKey(),
    /**
     * Kind discriminator. 'active' (Niveausat active-code, the original),
     * 'g2bulk' (g2bulkOrders), or 'bsv' (bsvOrders). Drives which source-order
     * table is loaded/refunded by the actions.
     */
    kind: text("kind").notNull().default("active"), // 'active' | 'g2bulk' | 'bsv'
    /**
     * Generic source-order row id (kind-specific table):
     * active→activeCodeOrders.id, g2bulk→g2bulkOrders.id, bsv→bsvOrders.id.
     */
    sourceOrderId: integer("source_order_id"),
    /**
     * Back-compat link, only set for kind='active'. Now NULLABLE so g2bulk/bsv
     * rows (which have no active_code_orders row) can be stored.
     */
    activeCodeOrderId: integer("active_code_order_id")
        .references(() => activeCodeOrders.id, { onDelete: "cascade" }),
    localOrderId: integer("local_order_id")
        .references(() => orders.id, { onDelete: "cascade" })
        .notNull(),
    resellerId: integer("reseller_id")
        .references(() => resellers.id, { onDelete: "cascade" })
        .notNull(),
    provider: text("provider").notNull().default("niveausat"), // niveausat | g2bulk | bsv
    planId: text("plan_id").notNull(), // generic productRef holder
    planLabel: text("plan_label"),
    lbOrderId: text("lb_order_id").notNull(),
    code: text("code"), // snapshot of the delivered code at request time
    priceDzd: numeric("price_dzd", { precision: 12, scale: 2 }).notNull(),
    reason: text("reason"),
    status: activeCodeRefundStatusEnum("status").notNull().default("PENDING"),
    reusable: boolean("reusable"), // set by admin at approval (null until decided)
    decisionReason: text("decision_reason"),
    decidedBy: integer("decided_by"), // user id of admin
    decidedAt: timestamp("decided_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
    pendingIdx: index("acrr_pending_idx").on(t.status, t.createdAt),
    // Non-unique listing index over the generic (kind, source_order_id).
    sourceIdx: index("acrr_source_idx").on(t.kind, t.sourceOrderId),
    // Money-safety: at most one PENDING request per source order, any kind.
    onePendingPerSource: uniqueIndex("acrr_one_pending_per_source_idx")
        .on(t.kind, t.sourceOrderId)
        .where(sql`status = 'PENDING'`),
}));

export const activeCodeRefundRequestsRelations = relations(activeCodeRefundRequests, ({ one }) => ({
    activeCodeOrder: one(activeCodeOrders, {
        fields: [activeCodeRefundRequests.activeCodeOrderId],
        references: [activeCodeOrders.id],
    }),
    localOrder: one(orders, {
        fields: [activeCodeRefundRequests.localOrderId],
        references: [orders.id],
    }),
    reseller: one(resellers, {
        fields: [activeCodeRefundRequests.resellerId],
        references: [resellers.id],
    }),
}));

/**
 * manualProducts — chef-managed catalogue for items the reseller can
 * buy but the operator has to fulfil by hand (no external panel).
 */
export const manualProducts = pgTable("manual_products", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category"),
    priceDzd: numeric("price_dzd", { precision: 12, scale: 2 }).notNull(),
    imageUrl: text("image_url"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const manualOrderStatusEnum = pgEnum("manual_order_status", [
    "PENDING_DELIVERY",
    "DELIVERED",
    "CANCELLED",
    "REFUNDED",
]);

export const manualOrders = pgTable("manual_orders", {
    id: serial("id").primaryKey(),
    localOrderId: integer("local_order_id")
        .references(() => orders.id, { onDelete: "cascade" })
        .notNull(),
    resellerId: integer("reseller_id")
        .references(() => resellers.id, { onDelete: "cascade" })
        .notNull(),
    manualProductId: integer("manual_product_id").references(() => manualProducts.id, { onDelete: "set null" }),
    productTitleSnapshot: text("product_title_snapshot").notNull(),
    pricePaidDzd: numeric("price_paid_dzd", { precision: 12, scale: 2 }).notNull(),
    customerPhone: text("customer_phone"),
    customerNote: text("customer_note"),
    deliveryNote: text("delivery_note"),
    status: manualOrderStatusEnum("status").notNull().default("PENDING_DELIVERY"),
    deliveredAt: timestamp("delivered_at", { mode: "date" }),
    deliveredByUserId: integer("delivered_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const manualOrdersRelations = relations(manualOrders, ({ one }) => ({
    localOrder: one(orders, {
        fields: [manualOrders.localOrderId],
        references: [orders.id],
    }),
    reseller: one(resellers, {
        fields: [manualOrders.resellerId],
        references: [resellers.id],
    }),
    product: one(manualProducts, {
        fields: [manualOrders.manualProductId],
        references: [manualProducts.id],
    }),
}));

export const g2bulkOrdersRelations = relations(g2bulkOrders, ({ one, many }) => ({
    localOrder: one(orders, {
        fields: [g2bulkOrders.localOrderId],
        references: [orders.id],
    }),
    reseller: one(resellers, {
        fields: [g2bulkOrders.resellerId],
        references: [resellers.id],
    }),
    codes: many(g2bulkDeliveredCodes),
}));

export const g2bulkDeliveredCodesRelations = relations(g2bulkDeliveredCodes, ({ one }) => ({
    g2bulkOrder: one(g2bulkOrders, {
        fields: [g2bulkDeliveredCodes.g2bulkOrderId],
        references: [g2bulkOrders.id],
    }),
}));

// ---------------------------------------------------------------------------
// IPTV reseller mirror — every line/code/device sold by a reseller across the
// four LoadBrain providers (panelking365 / atlaspro / ironmax / ibosol).
// LoadBrain itself only sees the robotech tenant; this table is the SOURCE
// OF TRUTH for "which reseller owns line X" and gates every read + mutation.
// ---------------------------------------------------------------------------
export const resellerIptvProviderEnum = pgEnum("reseller_iptv_provider", [
    "panelking365",
    "atlaspro",
    "ironmax",
    "ibosol",
]);

export const resellerIptvOrderStatusEnum = pgEnum("reseller_iptv_order_status", [
    "PENDING_LOADBRAIN",
    "ACTIVE",
    "FROZEN",
    "EXPIRED",
    "CANCELLED",
    "FAILED",
    "REFUNDED",
]);

export const resellerIptvOrders = pgTable("reseller_iptv_orders", {
    id: serial("id").primaryKey(),
    localOrderId: integer("local_order_id")
        .references(() => orders.id, { onDelete: "cascade" })
        .notNull(),
    resellerId: integer("reseller_id")
        .references(() => resellers.id, { onDelete: "cascade" })
        .notNull(),
    provider: resellerIptvProviderEnum("provider").notNull(),

    /** LoadBrain v2 task id (provision pipeline). */
    lbTaskId: text("lb_task_id").unique(),
    /** LoadBrain v2 order id (panelking/atlaspro hold this). */
    lbOrderId: text("lb_order_id"),
    /** Provider-native line id (ironmax) or device id (ibosol). */
    upstreamLineId: text("upstream_line_id"),
    /** Xtream username / device MAC / app identifier — whatever the customer needs. */
    providerAccountId: text("provider_account_id"),

    productId: text("product_id").notNull(),
    productName: text("product_name").notNull(),
    productSnapshot: jsonb("product_snapshot").$type<unknown>(),
    quantity: integer("quantity").default(1).notNull(),
    pricePaidDzd: numeric("price_paid_dzd", { precision: 12, scale: 2 }).notNull(),

    status: resellerIptvOrderStatusEnum("status")
        .default("PENDING_LOADBRAIN")
        .notNull(),
    lastStatusAt: timestamp("last_status_at", { withTimezone: true, mode: "date" })
        .defaultNow()
        .notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),

    customerLabel: text("customer_label"),
    customerPhone: text("customer_phone"),
    notes: text("notes"),

    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    refundedAt: timestamp("refunded_at", { withTimezone: true, mode: "date" }),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
        .defaultNow()
        .notNull(),
}, (table) => ({
    resellerIdx: index("rio_reseller_idx").on(table.resellerId),
    resellerStatusIdx: index("rio_reseller_status_idx").on(table.resellerId, table.status),
    providerIdx: index("rio_provider_idx").on(table.provider),
    lbOrderIdx: index("rio_lb_order_idx").on(table.lbOrderId),
    // Partial indexes (mirror migration 0020). Declared here so drizzle-kit is
    // aware of them and won't drop them on the next generate.
    expiresIdx: index("rio_expires_idx")
        .on(table.expiresAt)
        .where(sql`expires_at IS NOT NULL`),
    upstreamLineIdx: index("rio_upstream_line_idx")
        .on(table.provider, table.upstreamLineId)
        .where(sql`upstream_line_id IS NOT NULL`),
    pendingIdx: index("rio_pending_idx")
        .on(table.resellerId, table.createdAt)
        .where(sql`status = 'PENDING_LOADBRAIN'`),
}));

export const resellerIptvOrdersRelations = relations(resellerIptvOrders, ({ one }) => ({
    localOrder: one(orders, {
        fields: [resellerIptvOrders.localOrderId],
        references: [orders.id],
    }),
    reseller: one(resellers, {
        fields: [resellerIptvOrders.resellerId],
        references: [resellers.id],
    }),
}));

// ---------------------------------------------------------------------------
// Central B2B Wallet — singleton wallet (id = 1) holding admin-managed funds.
// Admin tops it up manually (bank transfer received, etc.). Admin then
// disburses to reseller wallets, which is how resellers get recharged.
// ---------------------------------------------------------------------------
export const centralWallet = pgTable("central_wallet", {
    id: integer("id").primaryKey().default(1),
    balance: numeric("balance", { precision: 12, scale: 2 }).default("0").notNull(),
    totalToppedUp: numeric("total_topped_up", { precision: 12, scale: 2 }).default("0").notNull(),
    totalDisbursed: numeric("total_disbursed", { precision: 12, scale: 2 }).default("0").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const centralWalletTransactions = pgTable("central_wallet_transactions", {
    id: serial("id").primaryKey(),
    type: text("type").notNull(), // 'admin_topup' | 'reseller_credit' | 'adjustment'
    amountDzd: numeric("amount_dzd", { precision: 12, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }).notNull(),
    resellerId: integer("reseller_id").references(() => resellers.id, { onDelete: "set null" }),
    adminUserId: integer("admin_user_id").references(() => users.id, { onDelete: "set null" }),
    reference: text("reference"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => ({
    typeIdx: index("cwt_type_idx").on(table.type),
    resellerIdx: index("cwt_reseller_idx").on(table.resellerId),
    createdAtIdx: index("cwt_created_at_idx").on(table.createdAt),
}));

export const centralWalletTransactionsRelations = relations(centralWalletTransactions, ({ one }) => ({
    reseller: one(resellers, {
        fields: [centralWalletTransactions.resellerId],
        references: [resellers.id],
    }),
    adminUser: one(users, {
        fields: [centralWalletTransactions.adminUserId],
        references: [users.id],
    }),
}));

// ─── Streaming Auto-Code Deeplink ─────────────────────────────────────────────
// Token-only public page that streams Netflix OTP / household links to the customer.
export const slotActivationTokens = pgTable("slot_activation_tokens", {
    id: serial("id").primaryKey(),
    token: varchar("token", { length: 16 }).notNull().unique(),
    slotId: integer("slot_id").references(() => digitalCodeSlots.id, { onDelete: "cascade" }).notNull(),
    validFrom: timestamp("valid_from", { mode: "date" }).defaultNow().notNull(),
    validUntil: timestamp("valid_until", { mode: "date" }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => ({
    tokenIdx: index("sat_token_idx").on(table.token),
    slotIdx: index("sat_slot_idx").on(table.slotId),
    lastSeenIdx: index("sat_last_seen_idx").on(table.lastSeenAt),
}));

export const slotEvents = pgTable("slot_events", {
    id: serial("id").primaryKey(),
    slotId: integer("slot_id").references(() => digitalCodeSlots.id, { onDelete: "set null" }),
    digitalCodeId: integer("digital_code_id").references(() => digitalCodes.id, { onDelete: "cascade" }).notNull(),
    eventType: varchar("event_type", { length: 20 }).notNull(), // OTP_CODE | HOUSEHOLD_LINK
    valueEncrypted: text("value_encrypted").notNull(),
    sourceEmailId: text("source_email_id"),
    deliveredToSession: boolean("delivered_to_session").default(false).notNull(),
    deliveredAt: timestamp("delivered_at", { mode: "date" }),
    receivedAt: timestamp("received_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => ({
    receivedIdx: index("se_received_idx").on(table.receivedAt),
    slotIdx: index("se_slot_idx").on(table.slotId),
    // Partial UNIQUE dedup index (mirrors migration 0018). Declared here so
    // drizzle-kit is aware of it and won't drop it on the next generate.
    dedupIdx: uniqueIndex("se_dedup_idx")
        .on(table.digitalCodeId, table.sourceEmailId)
        .where(sql`source_email_id IS NOT NULL`),
}));

export const slotLifecycle = pgTable("slot_lifecycle", {
    slotId: integer("slot_id").primaryKey().references(() => digitalCodeSlots.id, { onDelete: "cascade" }),
    firstActivatedAt: timestamp("first_activated_at", { mode: "date" }),
    lastHouseholdAt: timestamp("last_household_at", { mode: "date" }),
    nextHouseholdExpectedAt: timestamp("next_household_expected_at", { mode: "date" }),
    monitoringIntensity: varchar("monitoring_intensity", { length: 10 }).default("NORMAL").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const slotActivationTokensRelations = relations(slotActivationTokens, ({ one }) => ({
    slot: one(digitalCodeSlots, {
        fields: [slotActivationTokens.slotId],
        references: [digitalCodeSlots.id],
    }),
}));

export const slotEventsRelations = relations(slotEvents, ({ one }) => ({
    slot: one(digitalCodeSlots, {
        fields: [slotEvents.slotId],
        references: [digitalCodeSlots.id],
    }),
    digitalCode: one(digitalCodes, {
        fields: [slotEvents.digitalCodeId],
        references: [digitalCodes.id],
    }),
}));
