CREATE TYPE "public"."seller_type" AS ENUM('platform', 'third_party', 'unknown');--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "seller_type" "seller_type" DEFAULT 'unknown' NOT NULL;