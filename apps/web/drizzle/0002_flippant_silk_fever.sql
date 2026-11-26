ALTER TABLE "price_history" ADD COLUMN "buy_box_price" integer;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "list_price" integer;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "coupon_discount" integer;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "shipping_cost" integer;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "is_lightning_deal" boolean;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "seller_name" text;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "fulfillment_type" text;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "new_offer_count" integer;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "lowest_new_price" integer;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "sales_rank" integer;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "rating" real;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "review_count" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category_path" text[];--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_url" text;