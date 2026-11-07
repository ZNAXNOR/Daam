import { and, desc, eq, gt } from "drizzle-orm";
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
			id: priceHistory.id,
			dealPrice: priceHistory.dealPrice,
			mrp: priceHistory.mrp,
			inStock: priceHistory.inStock,
			recordedAt: priceHistory.recordedAt,
		})
		.from(priceHistory)
		.where(eq(priceHistory.productId, productId))
		.orderBy(desc(priceHistory.recordedAt))
		.limit(1);

	return latest;
}

export async function updateLatestPriceHistory(
	id: number,
	newPrice: number,
): Promise<void> {
	await db
		.update(priceHistory)
		.set({ dealPrice: newPrice })
		.where(eq(priceHistory.id, id));
}

export async function getDailyExportData() {
	const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

	return db
		.select({
			productId: products.productId,
			platform: platforms.name,
			title: products.title,
			dealPrice: priceHistory.dealPrice,
			mrp: priceHistory.mrp,
			platformSellerId: sellers.platformSellerId,
			recordedAt: priceHistory.recordedAt,
		})
		.from(priceHistory)
		.innerJoin(products, eq(priceHistory.productId, products.id))
		.innerJoin(platforms, eq(products.platformId, platforms.id))
		.innerJoin(sellers, eq(priceHistory.sellerId, sellers.id))
		.where(gt(priceHistory.recordedAt, since));
}

export async function getProductHistory(
	platformName: string,
	productId: string,
) {
	const rows = await db
		.select({
			title: products.title,
			historyId: priceHistory.id,
			dealPrice: priceHistory.dealPrice,
			mrp: priceHistory.mrp,
			recordedAt: priceHistory.recordedAt,
		})
		.from(products)
		.innerJoin(platforms, eq(products.platformId, platforms.id))
		.leftJoin(priceHistory, eq(priceHistory.productId, products.id))
		.where(
			and(
				eq(platforms.name, platformName),
				eq(products.productId, productId),
			),
		)
		.orderBy(desc(priceHistory.recordedAt))
		.limit(90);

	if (rows.length === 0) {
		return null;
	}

	return {
		title: rows[0].title,
		history: rows
			.filter((row) => row.historyId !== null)
			.map(({ historyId: _historyId, ...history }) => history),
	};
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
