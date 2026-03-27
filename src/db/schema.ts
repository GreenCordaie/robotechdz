import { pgTable, serial, text, timestamp, numeric, integer, boolean, jsonb, pgEnum, index, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { OrderStatus, UserRole, ClientActionType, DeliveryMethod, SupplierTransactionType, DigitalCodeStatus, DigitalCodeSlotStatus, OrderSource } from "@/lib/constants";

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
}, (table) => {
    return {
        productIdIdx: index("product_id_idx").on(table.productId),
    };
});

export const suppliers = pgTable("suppliers", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    balance: numeric("balance", { precision: 12, scale: 2 }).default("0"),
    currency: text("currency").default("DZD"), // 'USD' or 'DZD'
    status: text("status").default("ACTIVE").notNull(), // 'ACTIVE' or 'INACTIVE'
});

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
    status: digitalCodeStatusEnum("status").default("DISPONIBLE").notNull(),
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }), // Cost of the account
    purchaseCurrency: text("purchase_currency").default("DZD"),
    isDebitCompleted: boolean("is_debit_completed").default(false).notNull(),
    orderItemId: integer("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
    expiresAt: timestamp("expires_at", { mode: 'date' }),
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
}, (table) => {
    return {
        digitalCodeIdIdx: index("dcs_digital_code_id_idx").on(table.digitalCodeId),
        statusIdx: index("dcs_status_idx").on(table.status),
        orderItemIdIdx: index("dcs_order_item_id_idx").on(table.orderItemId),
    };
});

export const clientPayments = pgTable("client_payments", {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    montantDzd: numeric("montant_dzd", { precision: 12, scale: 2 }).notNull(),
    typeAction: actionTypeEnum("type_action").notNull(), // ACOMPTE, REMBOURSEMENT, RETOUR
    note: text("note"),
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
    accentColor: text("accent_color").default("#ec5b13"),
    logoUrl: text("logo_url"),
    dashboardLogoUrl: text("dashboard_logo_url"),
    faviconUrl: text("favicon_url"),
    telegramBotToken: text("telegram_bot_token"),
    telegramChatId: text("telegram_chat_id"),
    telegramChatIdAdmin: text("telegram_chat_id_admin"),
    telegramChatIdCaisse: text("telegram_chat_id_caisse"),
    telegramChatIdTraiteur: text("telegram_chat_id_traiteur"),
    webhookUrl: text("webhook_url"),
    whatsappToken: text("whatsapp_token"),
    whatsappPhoneId: text("whatsapp_phone_id"),
    isB2bEnabled: boolean("is_b2b_enabled").default(false).notNull(),
    defaultResellerDiscount: numeric("default_reseller_discount", { precision: 5, scale: 2 }).default("5.00"),
    minResellerRecharge: numeric("min_reseller_recharge", { precision: 12, scale: 2 }).default("1000.00"),
    isMaintenanceMode: boolean("is_maintenance_mode").default(false).notNull(),
    allowedIps: text("allowed_ips"),
    whatsappApiUrl: text("whatsapp_api_url").default("http://localhost:3001"),
    whatsappApiKey: text("whatsapp_api_key"),
    whatsappInstanceName: text("whatsapp_instance_name").default("FLEXBOX_BOT"),
    whatsappSenderNumber: text("whatsapp_sender_number"),
    whatsappMessageTemplate: text("whatsapp_message_template"),
    chatbotEnabled: boolean("chatbot_enabled").default(false).notNull(),
    chatbotGreeting: text("chatbot_greeting"),
    whatsappWebhookUrl: text("whatsapp_webhook_url"),
    whatsappVerifyToken: text("whatsapp_verify_token").default("flexbox_direct_webhook_secret"),
    geminiApiKey: text("gemini_api_key"),
    chatbotRole: text("chatbot_role"),
    n8nWebhookUrl: text("n8n_webhook_url"),
    usdExchangeRate: numeric("usd_exchange_rate", { precision: 10, scale: 2 }).default("245.00").notNull(),
    vapidPublicKey: text("vapid_public_key"),
    vapidPrivateKey: text("vapid_private_key"),
    stockAlertThreshold: integer("stock_alert_threshold").default(5).notNull(),
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

export const resellers = pgTable("resellers", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    companyName: text("company_name").notNull(),
    contactPhone: text("contact_phone"),
    customDiscount: numeric("custom_discount", { precision: 5, scale: 2 }), // Override global discount
    status: text("status").default("ACTIVE").notNull(), // 'ACTIVE', 'SUSPENDED'
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
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
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
}, (table) => {
    return {
        walletIdIdx: index("rt_wallet_id_idx").on(table.walletId),
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
    orders: many(orders),
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
