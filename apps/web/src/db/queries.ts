import { desc, eq } from "drizzle-orm";
import { db } from "./index";
import { platforms, priceHistory, products, sellers } from "./schema";

export async function upsertPlatform(name: string): Promise<number> {
	const [platform] = await db
		.insert(platforms)
		.values({ name })
		.onConflictDoUpdate({
			target: platforms.name,
			set: { name },
		})
		.returning({ id: platforms.id });

	if (!platform) {
		throw new Error(`Unable to resolve platform "${name}".`);
	}

	return platform.id;
}

export async function upsertSeller(
	platformSellerId: string,
	name: string,
): Promise<number> {
	const [seller] = await db
		.insert(sellers)
		.values({ platformSellerId, name })
		.onConflictDoUpdate({
			target: sellers.platformSellerId,
			set: { name },
		})
		.returning({ id: sellers.id });

	if (!seller) {
		throw new Error(`Unable to resolve seller "${platformSellerId}".`);
	}

	return seller.id;
}

export async function upsertProduct(
	platformId: number,
	productId: string,
	title: string,
): Promise<number> {
	const [product] = await db
		.insert(products)
		.values({ platformId, productId, title })
		.onConflictDoUpdate({
			target: [products.platformId, products.productId],
			set: { title },
		})
		.returning({ id: products.id });

	if (!product) {
		throw new Error(`Unable to resolve product "${productId}".`);
	}

	return product.id;
}

export async function findLatestPriceHistory(productId: number) {
	const [latest] = await db
		.select({
			dealPrice: priceHistory.dealPrice,
			mrp: priceHistory.mrp,
			inStock: priceHistory.inStock,
		})
		.from(priceHistory)
		.where(eq(priceHistory.productId, productId))
		.orderBy(desc(priceHistory.recordedAt))
		.limit(1);

	return latest;
}

export async function insertPriceHistory(values: {
	productId: number;
	sellerId: number;
	dealPrice: number;
	mrp: number | null;
	inStock: boolean;
}): Promise<void> {
	await db.insert(priceHistory).values(values);
}

export async function resolveSeller(
	sellerId: string | null | undefined,
	sellerName: string | null | undefined,
): Promise<number> {
	const normalizedSellerId = sellerId?.trim();

	return upsertSeller(
		normalizedSellerId || "unknown",
		normalizedSellerId ? sellerName?.trim() || "Unknown" : "Unknown",
	);
}
