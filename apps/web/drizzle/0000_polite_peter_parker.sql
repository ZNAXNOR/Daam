CREATE TABLE "platforms" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platforms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	CONSTRAINT "platforms_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"deal_price" integer NOT NULL,
	"mrp" integer,
	"in_stock" boolean DEFAULT true NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"platform_id" integer NOT NULL,
	"product_id" text NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sellers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"platform_seller_id" text NOT NULL,
	"name" text,
	CONSTRAINT "sellers_platform_seller_id_unique" UNIQUE("platform_seller_id")
);
--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "products_platform_product_idx" ON "products" USING btree ("platform_id","product_id");