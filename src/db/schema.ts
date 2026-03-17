import { pgTable, serial, text, timestamp, numeric, integer, boolean, jsonb, pgEnum, index, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const orderStatusEnum = pgEnum("order_status", ["EN_ATTENTE", "PAYE", "LIVRE", "TERMINE", "ANNULE", "PARTIEL", "NON_PAYE", "REMBOURSE"]);
export const userRoleEnum = pgEnum("user_role", ["ADMIN", "CAISSIER", "TRAITEUR", "RESELLER"]);
export const actionTypeEnum = pgEnum("action_type", ["ACOMPTE", "REMBOURSEMENT", "RETOUR"]);
export const deliveryMethodEnum = pgEnum("delivery_method", ["TICKET", "WHATSAPP"]);
export const supplierTransactionTypeEnum = pgEnum("supplier_transaction_type", ["RECHARGE", "AJUSTEMENT", "ACHAT_STOCK", "DEBIT"]);
export const digitalCodeStatusEnum = pgEnum("digital_code_status", ["DISPONIBLE", "VENDU", "UTILISE", "DEFECTUEUX"]);
export const digitalCodeSlotStatusEnum = pgEnum("digital_code_slot_status", ["DISPONIBLE", "VENDU", "DEFECTUEUX"]);
export const orderSourceEnum = pgEnum("order_source", ["KIOSK", "B2B_WEB", "API"]);

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

export const supplierTransactions = pgTable("supplier_transactions", {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "cascade" }).notNull(),
    type: text("type").notNull(), // 'RECHARGE' or 'DEBIT' (simplified as per request)
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(), // 'DZD' or 'USD'
    reason: text("reason"),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow().notNull(),
}, (table) => {
    return {
        supplierIdIdx: index("st_supplier_id_idx").on(table.supplierId),
        createdAtIdx: index("st_created_at_idx").on(table.createdAt),
    };
});

export const clients = pgTable("clients", {
    id: serial("id").primaryKey(),
    nomComplet: text("nom_complet").notNull(),
    telephone: text("telephone"),
    totalDetteDzd: numeric("total_dette_dzd", { precision: 12, scale: 2 }).default("0"),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
});

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
    isDelivered: boolean("is_delivered").default(false),
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
    customData: text("custom_data"),
    playerNickname: text("player_nickname"),
});

export const digitalCodes = pgTable("digital_codes", {
    id: serial("id").primaryKey(),
    variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "cascade" }).notNull(),
    code: text("code").notNull(),
    status: digitalCodeStatusEnum("status").default("DISPONIBLE").notNull(),
    isDebitCompleted: boolean("is_debit_completed").default(false).notNull(),
    orderItemId: integer("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
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
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
});

export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    nom: text("nom").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    pinCode: text("pin_code").notNull(),
    role: userRoleEnum("role").default("CAISSIER").notNull(),
    avatarUrl: text("avatar_url"),
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
});

export const supportTickets = pgTable("support_tickets", {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    customerPhone: text("customer_phone"),
    status: text("status").default("OUVERT").notNull(), // 'OUVERT', 'TRAITE', 'FERME'
    createdAt: timestamp("created_at", { mode: 'date' }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: 'date' }).defaultNow(),
}, (table) => {
    return {
        orderIdIdx: index("st_order_id_idx").on(table.orderId),
        statusIdx: index("st_status_idx").on(table.status),
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

export const ordersRelationsB2b = relations(orders, ({ one }) => ({
    reseller: one(resellers, {
        fields: [orders.resellerId],
        references: [resellers.id],
    }),
}));
