CREATE TYPE "public"."action_type" AS ENUM('ACOMPTE', 'REMBOURSEMENT');--> statement-breakpoint
CREATE TYPE "public"."delivery_method" AS ENUM('TICKET', 'WHATSAPP');--> statement-breakpoint
CREATE TYPE "public"."digital_code_status" AS ENUM('DISPONIBLE', 'VENDU', 'UTILISE');--> statement-breakpoint
CREATE TYPE "public"."supplier_transaction_type" AS ENUM('RECHARGE', 'AJUSTEMENT', 'ACHAT_STOCK');--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'LIVRE' BEFORE 'TERMINE';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'PARTIEL';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'NON_PAYE';--> statement-breakpoint
CREATE TABLE "client_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"order_id" integer,
	"montant_dzd" numeric(12, 2) NOT NULL,
	"type_action" "action_type" NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom_complet" text NOT NULL,
	"telephone" text,
	"total_dette_dzd" numeric(12, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "digital_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"code" text NOT NULL,
	"status" "digital_code_status" DEFAULT 'DISPONIBLE' NOT NULL,
	"order_item_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"variant_id" integer NOT NULL,
	"name" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"supplier_id" integer,
	"custom_data" text
);
--> statement-breakpoint
ALTER TABLE "product_variant_suppliers" DROP CONSTRAINT "product_variant_suppliers_variant_id_product_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "product_variant_suppliers" DROP CONSTRAINT "product_variant_suppliers_supplier_id_suppliers_id_fk";
--> statement-breakpoint
ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_category_id_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_transactions" DROP CONSTRAINT "supplier_transactions_supplier_id_suppliers_id_fk";
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "remise" numeric(12, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "montant_paye" numeric(12, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reste_a_payer" numeric(12, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "client_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_method" "delivery_method" DEFAULT 'TICKET' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_phone" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_delivered" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "requires_player_id" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "raison_sociale" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "ein" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "dashboard_logo_url" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "favicon_url" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "telegram_bot_token" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "webhook_url" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "whatsapp_token" text;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "whatsapp_phone_id" text;--> statement-breakpoint
ALTER TABLE "supplier_transactions" ADD COLUMN "type" "supplier_transaction_type" DEFAULT 'RECHARGE' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_transactions" ADD COLUMN "sale_price_dzd" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "supplier_transactions" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "base_currency" text DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_codes" ADD CONSTRAINT "digital_codes_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_codes" ADD CONSTRAINT "digital_codes_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_suppliers" ADD CONSTRAINT "product_variant_suppliers_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_suppliers" ADD CONSTRAINT "product_variant_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "items";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "codes_data";