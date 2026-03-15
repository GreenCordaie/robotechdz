import { pgTable, serial, text, timestamp, numeric, integer, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const orderStatusEnum = pgEnum("order_status", ["EN_ATTENTE", "PAYE", "LIVRE", "TERMINE", "ANNULE", "PARTIEL", "NON_PAYE"]);
export const userRoleEnum = pgEnum("user_role", ["ADMIN", "CAISSIER", "TRAITEUR"]);
export const actionTypeEnum = pgEnum("action_type", ["ACOMPTE", "REMBOURSEMENT"]);
export const deliveryMethodEnum = pgEnum("delivery_method", ["TICKET", "WHATSAPP"]);

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
});

export const productVariants = pgTable("product_variants", {
    id: serial("id").primaryKey(),
    productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // ex: '1 Mois', '3 Mois'
    purchasePriceUsd: numeric("purchase_price_usd", { precision: 10, scale: 2 }).notNull(),
    salePriceDzd: numeric("sale_price_dzd", { precision: 10, scale: 2 }).notNull(),
    stockStatus: boolean("stock_status").default(true),
});

export const suppliers = pgTable("suppliers", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    balanceDzd: numeric("balance_dzd", { precision: 12, scale: 2 }).default("0"),
    balanceUsd: numeric("balance_usd", { precision: 12, scale: 2 }).default("0"),
    exchangeRate: numeric("exchange_rate", { precision: 10, scale: 2 }).default("0"),
    baseCurrency: text("base_currency").default("USD"), // 'USD' or 'DZD'
});

export const supplierTransactionTypeEnum = pgEnum("supplier_transaction_type", ["RECHARGE", "AJUSTEMENT", "ACHAT_STOCK"]);

export const supplierTransactions = pgTable("supplier_transactions", {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "cascade" }),
    type: supplierTransactionTypeEnum("type").default("RECHARGE").notNull(),
    amountUsd: numeric("amount_usd", { precision: 12, scale: 2 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 10, scale: 2 }).notNull(),
    amountDzd: numeric("amount_dzd", { precision: 12, scale: 2 }).notNull(),
    salePriceDzd: numeric("sale_price_dzd", { precision: 12, scale: 2 }), // Price sold to customer
    reason: text("reason"),
    status: text("status").default("COMPLETED"), // COMPLETED, PENDING
    createdAt: timestamp("created_at").defaultNow(),
});

export const digitalCodeStatusEnum = pgEnum("digital_code_status", ["DISPONIBLE", "VENDU", "UTILISE"]);

export const clients = pgTable("clients", {
    id: serial("id").primaryKey(),
    nomComplet: text("nom_complet").notNull(),
    telephone: text("telephone"),
    totalDetteDzd: numeric("total_dette_dzd", { precision: 12, scale: 2 }).default("0"),
    createdAt: timestamp("created_at").defaultNow(),
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
    deliveryMethod: deliveryMethodEnum("delivery_method").default("TICKET").notNull(),
    customerPhone: text("customer_phone"),
    isDelivered: boolean("is_delivered").default(false),
    createdAt: timestamp("created_at").defaultNow(),
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
});

export const digitalCodes = pgTable("digital_codes", {
    id: serial("id").primaryKey(),
    variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "cascade" }).notNull(),
    code: text("code").notNull(),
    status: digitalCodeStatusEnum("status").default("DISPONIBLE").notNull(),
    orderItemId: integer("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow(),
});

export const clientPayments = pgTable("client_payments", {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    montantDzd: numeric("montant_dzd", { precision: 12, scale: 2 }).notNull(),
    typeAction: actionTypeEnum("type_action").notNull(), // ACOMPTE, REMBOURSEMENT
    createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    nom: text("nom").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    pinCode: text("pin_code").notNull(),
    role: userRoleEnum("role").default("CAISSIER").notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at").defaultNow(),
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
    webhookUrl: text("webhook_url"),
    whatsappToken: text("whatsapp_token"),
    whatsappPhoneId: text("whatsapp_phone_id"),
});

export const productVariantSuppliers = pgTable("product_variant_suppliers", {
    id: serial("id").primaryKey(),
    variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "cascade" }).notNull(),
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "cascade" }).notNull(),
    purchasePriceUsd: numeric("purchase_price_usd", { precision: 10, scale: 2 }).notNull(),
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
}));

export const digitalCodesRelations = relations(digitalCodes, ({ one }) => ({
    variant: one(productVariants, {
        fields: [digitalCodes.variantId],
        references: [productVariants.id],
    }),
    orderItem: one(orderItems, {
        fields: [digitalCodes.orderItemId],
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
