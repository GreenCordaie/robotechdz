CREATE TABLE "product_variant_suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"purchase_price_usd" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_name" text DEFAULT 'FLEXBOX DIRECT',
	"shop_address" text,
	"shop_tel" text,
	"footer_message" text,
	"show_cashier_on_receipt" boolean DEFAULT true,
	"show_date_time_on_receipt" boolean DEFAULT true,
	"show_logo_on_receipt" boolean DEFAULT false,
	"accent_color" text DEFAULT '#ec5b13',
	"logo_url" text
);
--> statement-breakpoint
ALTER TABLE "product_variant_suppliers" ADD CONSTRAINT "product_variant_suppliers_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_suppliers" ADD CONSTRAINT "product_variant_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;