import {
	boolean,
	integer,
	pgEnum,
	pgTable,
	real,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const sellerTypeEnum = pgEnum("seller_type", ["platform", "third_party", "unknown"]);

export const platforms = pgTable("platforms", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	name: text().notNull().unique(),
});

export const sellers = pgTable("sellers", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	platformSellerId: text("platform_seller_id").notNull().unique(),
	name: text(),
});

export const products = pgTable(
	"products",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		platformId: integer("platform_id")
			.notNull()
			.references(() => platforms.id, {
				onDelete: "restrict",
				onUpdate: "cascade",
			}),
		productId: text("product_id").notNull(),
		title: text().notNull(),
		brand: text(),
		categoryPath: text("category_path").array(),
		imageUrl: text("image_url"),
	},
	(table) => [uniqueIndex("products_platform_product_idx").on(table.platformId, table.productId)],
);

export const priceHistory = pgTable("price_history", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	productId: integer("product_id")
		.notNull()
		.references(() => products.id, {
			onDelete: "restrict",
			onUpdate: "cascade",
		}),
	sellerId: integer("seller_id")
		.notNull()
		.references(() => sellers.id, {
			onDelete: "restrict",
			onUpdate: "cascade",
		}),
	dealPrice: integer("deal_price").notNull(),
	mrp: integer(),
	inStock: boolean("in_stock").notNull().default(true),
	sellerType: sellerTypeEnum("seller_type").notNull().default("unknown"),
	buyBoxPrice: integer("buy_box_price"),
	listPrice: integer("list_price"),
	couponDiscount: integer("coupon_discount"),
	shippingCost: integer("shipping_cost"),
	isLightningDeal: boolean("is_lightning_deal"),
	sellerName: text("seller_name"),
	fulfillmentType: text("fulfillment_type", {
		enum: ["amazon", "fba", "fbm", "unknown"],
	}),
	newOfferCount: integer("new_offer_count"),
	lowestNewPrice: integer("lowest_new_price"),
	salesRank: integer("sales_rank"),
	rating: real(),
	reviewCount: integer("review_count"),
	recordedAt: timestamp("recorded_at", {
		withTimezone: true,
		mode: "date",
	})
		.notNull()
		.defaultNow(),
});

export type Platform = typeof platforms.$inferSelect;
export type NewPlatform = typeof platforms.$inferInsert;
export type Seller = typeof sellers.$inferSelect;
export type NewSeller = typeof sellers.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type PriceHistory = typeof priceHistory.$inferSelect;
export type NewPriceHistory = typeof priceHistory.$inferInsert;
