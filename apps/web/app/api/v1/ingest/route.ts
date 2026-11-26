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
		const productId = await upsertProduct(platformId, payload.productId, payload.title);
		const latest = await findLatestPriceHistory(productId);
		const mrp = payload.mrp ?? null;

		if (
			latest &&
			latest.dealPrice === payload.dealPrice &&
			latest.mrp === mrp &&
			latest.inStock === payload.inStock &&
			latest.sellerType === (payload.sellerType ?? "unknown")
		) {
			return response(payload.productId, "SKIPPED_DEDUPLICATED");
		}

		if (latest) {
			const elapsedMs = new Date().getTime() - latest.recordedAt.getTime();

			if (elapsedMs < DEBOUNCE_WINDOW_MS) {
				if (
					payload.dealPrice < latest.dealPrice ||
					payload.inStock !== latest.inStock ||
					(payload.sellerType ?? "unknown") !== latest.sellerType
				) {
					await updateLatestPriceHistory(latest.id, {
						dealPrice: Math.min(payload.dealPrice, latest.dealPrice),
						inStock: payload.inStock,
						sellerType: payload.sellerType ?? "unknown",
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
