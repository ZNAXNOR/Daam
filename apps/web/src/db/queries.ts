import { and, asc, desc, eq, gt, gte, sql } from "drizzle-orm";
import type {
	FulfillmentType,
	ProductIntelligenceHistoryPoint,
	ProductIntelligenceResponse,
	ProductSignals,
	ProductVerdict,
} from "@daam/contracts";
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

export async function upsertSeller(platformSellerId: string, name: string): Promise<number> {
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
	metadata: Pick<ProductSignals, "brand" | "categoryPath" | "imageUrl"> = {},
): Promise<number> {
	const [product] = await db
		.insert(products)
		.values({
			platformId,
			productId,
			title,
			brand: metadata.brand ?? null,
			categoryPath: metadata.categoryPath ?? null,
			imageUrl: metadata.imageUrl ?? null,
		})
		.onConflictDoUpdate({
			target: [products.platformId, products.productId],
			set: {
				title,
				brand: metadata.brand ?? sql`${products.brand}`,
				categoryPath: metadata.categoryPath ?? sql`${products.categoryPath}`,
				imageUrl: metadata.imageUrl ?? sql`${products.imageUrl}`,
			},
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
			sellerType: priceHistory.sellerType,
			buyBoxPrice: priceHistory.buyBoxPrice,
			listPrice: priceHistory.listPrice,
			couponDiscount: priceHistory.couponDiscount,
			shippingCost: priceHistory.shippingCost,
			isLightningDeal: priceHistory.isLightningDeal,
			sellerName: priceHistory.sellerName,
			fulfillmentType: priceHistory.fulfillmentType,
			newOfferCount: priceHistory.newOfferCount,
			lowestNewPrice: priceHistory.lowestNewPrice,
			salesRank: priceHistory.salesRank,
			rating: priceHistory.rating,
			reviewCount: priceHistory.reviewCount,
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
	values: {
		dealPrice: number;
		inStock: boolean;
		sellerType: "platform" | "third_party" | "unknown";
		buyBoxPrice: number | null;
		listPrice: number | null;
		couponDiscount: number | null;
		shippingCost: number | null;
		isLightningDeal: boolean | null;
		sellerName: string | null;
		fulfillmentType: FulfillmentType | null;
		newOfferCount: number | null;
		lowestNewPrice: number | null;
		salesRank: number | null;
		rating: number | null;
		reviewCount: number | null;
	},
): Promise<void> {
	await db.update(priceHistory).set(values).where(eq(priceHistory.id, id));
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

const HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const RECENT_SPIKE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PRICE_DEVIATION_RATIO = 0.1;

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function createVerdict(
	history: ProductIntelligenceHistoryPoint[],
	medianPrice: number,
): ProductVerdict {
	const current = history[history.length - 1];

	if (history.length === 1) {
		return { code: "tracking_started", label: "Tracking Started", tone: "neutral" };
	}

	const elapsedMs = Date.parse(current.timestamp) - Date.parse(history[0].timestamp);
	if (history.length < 6 && elapsedMs < 7 * 24 * 60 * 60 * 1000) {
		const minPrice = history.reduce(
			(minimum, point) => Math.min(minimum, point.effectivePrice),
			Infinity,
		);
		const maxPrice = history.reduce(
			(maximum, point) => Math.max(maximum, point.effectivePrice),
			-Infinity,
		);
		const isLowest = current.effectivePrice === minPrice;
		const isHighest = current.effectivePrice === maxPrice;

		if (isLowest && !isHighest) {
			return { code: "lowest_seen", label: "Lowest Seen", tone: "positive" };
		}
		if (isHighest && !isLowest) {
			return { code: "highest_seen", label: "Highest Seen", tone: "warning" };
		}
		return { code: "steady", label: "Steady", tone: "neutral" };
	}

	const recentCutoff = Date.parse(current.timestamp) - RECENT_SPIKE_WINDOW_MS;
	const recentHigh = history.reduce(
		(maximum, point) =>
			Date.parse(point.timestamp) >= recentCutoff
				? Math.max(maximum, point.effectivePrice)
				: maximum,
		-Infinity,
	);
	const previousMrps = history
		.slice(0, -1)
		.flatMap((point) => (point.mrp === undefined ? [] : [point.mrp]));
	const previousMedianMrp = previousMrps.length > 0 ? median(previousMrps) : null;
	const mrpWasBumped =
		current.mrp !== undefined &&
		previousMedianMrp !== null &&
		current.mrp >= previousMedianMrp * (1 + PRICE_DEVIATION_RATIO);

	if (
		current.effectivePrice >= medianPrice * (1 + PRICE_DEVIATION_RATIO) ||
		recentHigh >= medianPrice * (1 + PRICE_DEVIATION_RATIO) ||
		mrpWasBumped
	) {
		return { code: "inflated", label: "List Price Inflated", tone: "negative" };
	}

	if (current.effectivePrice <= medianPrice * (1 - PRICE_DEVIATION_RATIO)) {
		return { code: "true_deal", label: "True Deal", tone: "positive" };
	}

	return { code: "fair_price", label: "Fair Price", tone: "neutral" };
}

export async function getProductIntelligence(
	platformName: string,
	productId: string,
): Promise<ProductIntelligenceResponse | null> {
	const since = new Date(Date.now() - HISTORY_WINDOW_MS);
	const rows = await db
		.select({
			brand: products.brand,
			categoryPath: products.categoryPath,
			imageUrl: products.imageUrl,
			historyId: priceHistory.id,
			dealPrice: priceHistory.dealPrice,
			mrp: priceHistory.mrp,
			inStock: priceHistory.inStock,
			buyBoxPrice: priceHistory.buyBoxPrice,
			listPrice: priceHistory.listPrice,
			couponDiscount: priceHistory.couponDiscount,
			shippingCost: priceHistory.shippingCost,
			isLightningDeal: priceHistory.isLightningDeal,
			sellerName: priceHistory.sellerName,
			fulfillmentType: priceHistory.fulfillmentType,
			newOfferCount: priceHistory.newOfferCount,
			lowestNewPrice: priceHistory.lowestNewPrice,
			salesRank: priceHistory.salesRank,
			rating: priceHistory.rating,
			reviewCount: priceHistory.reviewCount,
			recordedAt: priceHistory.recordedAt,
		})
		.from(products)
		.innerJoin(platforms, eq(products.platformId, platforms.id))
		.leftJoin(
			priceHistory,
			and(eq(priceHistory.productId, products.id), gte(priceHistory.recordedAt, since)),
		)
		.where(and(eq(platforms.name, platformName), eq(products.productId, productId)))
		.orderBy(asc(priceHistory.recordedAt), asc(priceHistory.id));

	const toHistoryPoint = (row: (typeof rows)[number]): ProductIntelligenceHistoryPoint | null => {
		if (row.historyId === null || row.recordedAt === null || row.dealPrice === null) {
			return null;
		}

		return {
			timestamp: row.recordedAt.toISOString(),
			effectivePrice: row.dealPrice,
			...(row.mrp === null ? {} : { mrp: row.mrp }),
		};
	};
	const history: ProductIntelligenceHistoryPoint[] = rows.flatMap((row) => {
		const point = toHistoryPoint(row);
		return point ? [point] : [];
	});

	if (history.length === 0) {
		return null;
	}

	const availableHistory = rows.flatMap((row) => {
		if (!row.inStock) {
			return [];
		}
		const point = toHistoryPoint(row);
		return point ? [point] : [];
	});
	const statsHistory = availableHistory.length > 0 ? availableHistory : history;
	const prices = statsHistory.map((point) => point.effectivePrice);
	const latestRow = [...rows].reverse().find((row) => row.historyId !== null);
	const medianPrice = median(prices);
	const verdict =
		availableHistory.length > 0
			? createVerdict(availableHistory, medianPrice)
			: ({ code: "tracking_started", label: "Tracking Started", tone: "neutral" } as const);

	return {
		brand: latestRow?.brand ?? null,
		categoryPath: latestRow?.categoryPath ?? null,
		imageUrl: latestRow?.imageUrl ?? null,
		buyBoxPrice: latestRow?.buyBoxPrice ?? latestRow?.dealPrice ?? null,
		listPrice: latestRow?.listPrice ?? latestRow?.mrp ?? null,
		couponDiscount: latestRow?.couponDiscount ?? null,
		shippingCost: latestRow?.shippingCost ?? null,
		isLightningDeal: latestRow?.isLightningDeal ?? undefined,
		sellerName: latestRow?.sellerName ?? null,
		fulfillmentType: latestRow?.fulfillmentType ?? undefined,
		newOfferCount: latestRow?.newOfferCount ?? null,
		lowestNewPrice: latestRow?.lowestNewPrice ?? null,
		salesRank: latestRow?.salesRank ?? null,
		rating: latestRow?.rating ?? null,
		reviewCount: latestRow?.reviewCount ?? null,
		verdict,
		stats: {
			currentPrice: statsHistory[statsHistory.length - 1].effectivePrice,
			minPrice: prices.reduce((minimum, price) => Math.min(minimum, price), Infinity),
			maxPrice: prices.reduce((maximum, price) => Math.max(maximum, price), -Infinity),
			medianPrice,
			dataPoints: history.length,
		},
		history,
	};
}

export async function insertPriceHistory(values: {
	productId: number;
	sellerId: number;
	dealPrice: number;
	mrp: number | null;
	inStock: boolean;
	sellerType: "platform" | "third_party" | "unknown";
	buyBoxPrice: number | null;
	listPrice: number | null;
	couponDiscount: number | null;
	shippingCost: number | null;
	isLightningDeal: boolean | null;
	sellerName: string | null;
	fulfillmentType: FulfillmentType | null;
	newOfferCount: number | null;
	lowestNewPrice: number | null;
	salesRank: number | null;
	rating: number | null;
	reviewCount: number | null;
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
