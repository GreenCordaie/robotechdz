CREATE TYPE "public"."order_status" AS ENUM('EN_ATTENTE', 'PAYE', 'TERMINE', 'ANNULE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'CAISSIER', 'TRAITEUR');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"status" "order_status" DEFAULT 'EN_ATTENTE' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"items" jsonb NOT NULL,
	"codes_data" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer,
	"name" text NOT NULL,
	"purchase_price_usd" numeric(10, 2) NOT NULL,
	"sale_price_dzd" numeric(10, 2) NOT NULL,
	"stock_status" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer,
	"name" text NOT NULL,
	"description" text,
	"image_url" text
);
--> statement-breakpoint
CREATE TABLE "supplier_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer,
	"amount_usd" numeric(12, 2) NOT NULL,
	"exchange_rate" numeric(10, 2) NOT NULL,
	"amount_dzd" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'COMPLETED',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"balance_dzd" numeric(12, 2) DEFAULT '0',
	"balance_usd" numeric(12, 2) DEFAULT '0',
	"exchange_rate" numeric(10, 2) DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"pin_code" text NOT NULL,
	"role" "user_role" DEFAULT 'CAISSIER' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;