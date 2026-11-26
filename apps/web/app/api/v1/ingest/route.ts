import {
	type IngestionResponse,
	type ProductPayload,
	validateProductPayload,
} from "@daam/contracts";
import {
	findLatestPriceHistory,
	insertPriceHistory,
	resolveSeller,
	updateLatestPriceHistory,
	upsertPlatform,
	upsertProduct,
} from "@/src/db/queries";
import { logger } from "@/src/logger";

const DEBOUNCE_WINDOW_MS = 60 * 60 * 1000;
const MAX_ACCEPTED_PRICE_DROP = 0.15;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;
const requestsByIp = new Map<string, number[]>();

function isRateLimited(request: Request): boolean {
	const forwardedFor = request.headers.get("x-forwarded-for");
	const ipAddress =
		forwardedFor?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip")?.trim() ||
		"unknown";
	const now = Date.now();
	const recentRequests = (requestsByIp.get(ipAddress) ?? []).filter(
		(timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
	);

	if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
		requestsByIp.set(ipAddress, recentRequests);
		return true;
	}

	recentRequests.push(now);
	requestsByIp.set(ipAddress, recentRequests);

	if (requestsByIp.size > 10_000) {
		for (const [ip, timestamps] of requestsByIp) {
			if (timestamps.every((timestamp) => now - timestamp >= RATE_LIMIT_WINDOW_MS)) {
				requestsByIp.delete(ip);
			}
		}
	}

	return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isOptionalNullableNumber(value: Record<string, unknown>, key: string): boolean {
	const field = value[key];
	return (
		field === undefined ||
		field === null ||
		(typeof field === "number" && Number.isFinite(field))
	);
}

function isOptionalNullableString(value: Record<string, unknown>, key: string): boolean {
	const field = value[key];
	return field === undefined || field === null || typeof field === "string";
}

function isProductPayload(value: unknown): value is ProductPayload {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.platform === "string" &&
		typeof value.productId === "string" &&
		typeof value.title === "string" &&
		typeof value.dealPrice === "number" &&
		typeof value.inStock === "boolean" &&
		typeof value.currency === "string" &&
		typeof value.extractionMethod === "string" &&
		typeof value.timestamp === "number" &&
		(value.mrp === undefined || typeof value.mrp === "number" || value.mrp === null) &&
		(value.sellerId === undefined ||
			typeof value.sellerId === "string" ||
			value.sellerId === null) &&
		(value.sellerName === undefined ||
			typeof value.sellerName === "string" ||
			value.sellerName === null) &&
		isOptionalNullableString(value, "brand") &&
		isOptionalNullableString(value, "imageUrl") &&
		(value.categoryPath === undefined ||
			value.categoryPath === null ||
			(Array.isArray(value.categoryPath) &&
				value.categoryPath.every((part) => typeof part === "string"))) &&
		[
			"buyBoxPrice",
			"listPrice",
			"couponDiscount",
			"shippingCost",
			"newOfferCount",
			"lowestNewPrice",
			"salesRank",
			"rating",
			"reviewCount",
		].every((key) => isOptionalNullableNumber(value, key)) &&
		(value.isLightningDeal === undefined || typeof value.isLightningDeal === "boolean") &&
		(value.fulfillmentType === undefined ||
			["amazon", "fba", "fbm", "unknown"].includes(String(value.fulfillmentType))) &&
		(value.sellerType === undefined ||
			value.sellerType === "platform" ||
			value.sellerType === "third_party" ||
			value.sellerType === "unknown")
	);
}

function response(productId: string, action: IngestionResponse["action"], status = 200): Response {
	return Response.json(
		{
			success: status < 400,
			action,
			productId,
		} satisfies IngestionResponse,
		{ status },
	);
}

export async function POST(request: Request): Promise<Response> {
	if (isRateLimited(request)) {
		return Response.json(
			{ success: false, error: "Too many ingestion requests. Try again shortly." },
			{ status: 429 },
		);
	}

	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return Response.json(
			{ success: false, error: "Request body must be valid JSON." },
			{ status: 400 },
		);
	}

	if (!isProductPayload(body)) {
		return Response.json(
			{ success: false, error: "Request body is not a valid ProductPayload." },
			{ status: 400 },
		);
	}

	const payload = body;
	const validation = validateProductPayload(payload);
	if (!validation.valid) {
		return Response.json(
			{ success: false, error: "Payload validation failed.", details: validation.errors },
			{ status: 422 },
		);
	}

	try {
		const platformId = await upsertPlatform(payload.platform);
		const sellerId = await resolveSeller(payload.sellerId, payload.sellerName);
		const productId = await upsertProduct(platformId, payload.productId, payload.title, {
			brand: payload.brand,
			categoryPath: payload.categoryPath,
			imageUrl: payload.imageUrl,
		});
		const latest = await findLatestPriceHistory(productId);
		const mrp = payload.mrp ?? payload.listPrice ?? null;
		const signals = {
			buyBoxPrice: payload.buyBoxPrice ?? null,
			listPrice: payload.listPrice ?? payload.mrp ?? null,
			couponDiscount: payload.couponDiscount ?? null,
			shippingCost: payload.shippingCost ?? null,
			isLightningDeal: payload.isLightningDeal ?? null,
			sellerName: payload.sellerName ?? null,
			fulfillmentType: payload.fulfillmentType ?? null,
			newOfferCount: payload.newOfferCount ?? null,
			lowestNewPrice: payload.lowestNewPrice ?? null,
			salesRank: payload.salesRank ?? null,
			rating: payload.rating ?? null,
			reviewCount: payload.reviewCount ?? null,
		};
		const signalsMatch =
			latest &&
			(signals.buyBoxPrice === null || latest.buyBoxPrice === signals.buyBoxPrice) &&
			(signals.listPrice === null || latest.listPrice === signals.listPrice) &&
			(signals.couponDiscount === null || latest.couponDiscount === signals.couponDiscount) &&
			(signals.shippingCost === null || latest.shippingCost === signals.shippingCost) &&
			(signals.isLightningDeal === null ||
				latest.isLightningDeal === signals.isLightningDeal) &&
			(signals.sellerName === null || latest.sellerName === signals.sellerName) &&
			(signals.fulfillmentType === null ||
				latest.fulfillmentType === signals.fulfillmentType) &&
			(signals.newOfferCount === null || latest.newOfferCount === signals.newOfferCount) &&
			(signals.lowestNewPrice === null || latest.lowestNewPrice === signals.lowestNewPrice) &&
			(signals.salesRank === null || latest.salesRank === signals.salesRank) &&
			(signals.rating === null || latest.rating === signals.rating) &&
			(signals.reviewCount === null || latest.reviewCount === signals.reviewCount);

		if (
			latest &&
			latest.dealPrice === payload.dealPrice &&
			latest.mrp === mrp &&
			latest.inStock === payload.inStock &&
			latest.sellerType === (payload.sellerType ?? "unknown") &&
			signalsMatch
		) {
			return response(payload.productId, "SKIPPED_DEDUPLICATED");
		}

		if (latest) {
			const elapsedMs = new Date().getTime() - latest.recordedAt.getTime();

			if (elapsedMs < DEBOUNCE_WINDOW_MS) {
				if (
					payload.dealPrice < latest.dealPrice ||
					payload.inStock !== latest.inStock ||
					(payload.sellerType ?? "unknown") !== latest.sellerType ||
					!signalsMatch
				) {
					await updateLatestPriceHistory(latest.id, {
						dealPrice: Math.min(payload.dealPrice, latest.dealPrice),
						inStock: payload.inStock,
						sellerType: payload.sellerType ?? "unknown",
						buyBoxPrice: signals.buyBoxPrice ?? latest.buyBoxPrice,
						listPrice: signals.listPrice ?? latest.listPrice,
						couponDiscount: signals.couponDiscount ?? latest.couponDiscount,
						shippingCost: signals.shippingCost ?? latest.shippingCost,
						isLightningDeal: signals.isLightningDeal ?? latest.isLightningDeal,
						sellerName: signals.sellerName ?? latest.sellerName,
						fulfillmentType: signals.fulfillmentType ?? latest.fulfillmentType,
						newOfferCount: signals.newOfferCount ?? latest.newOfferCount,
						lowestNewPrice: signals.lowestNewPrice ?? latest.lowestNewPrice,
						salesRank: signals.salesRank ?? latest.salesRank,
						rating: signals.rating ?? latest.rating,
						reviewCount: signals.reviewCount ?? latest.reviewCount,
					});
				}

				return response(payload.productId, "SKIPPED_DEDUPLICATED");
			}

			const priceDrop = (latest.dealPrice - payload.dealPrice) / latest.dealPrice;
			if (priceDrop > MAX_ACCEPTED_PRICE_DROP) {
				return response(payload.productId, "REJECTED_ANOMALY", 406);
			}
		}

		await insertPriceHistory({
			productId,
			sellerId,
			dealPrice: payload.dealPrice,
			mrp,
			inStock: payload.inStock,
			sellerType: payload.sellerType ?? "unknown",
			...signals,
		});

		return response(payload.productId, "INSERTED_PRICE_CHANGE");
	} catch {
		logger.dbConnectionFailed();
		return Response.json(
			{ success: false, error: "Unable to ingest product payload." },
			{ status: 500 },
		);
	}
}
