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

const DEBOUNCE_WINDOW_MS = 60 * 60 * 1000;
const MAX_ACCEPTED_PRICE_DROP = 0.15;

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
			value.sellerName === null)
	);
}

function response(
	productId: string,
	action: IngestionResponse["action"],
	status = 200,
): Response {
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
		const productId = await upsertProduct(
			platformId,
			payload.productId,
			payload.title,
		);
		const latest = await findLatestPriceHistory(productId);
		const mrp = payload.mrp ?? null;

		if (
			latest &&
			latest.dealPrice === payload.dealPrice &&
			latest.mrp === mrp &&
			latest.inStock === payload.inStock
		) {
			return response(payload.productId, "SKIPPED_DEDUPLICATED");
		}

		if (latest) {
			const elapsedMs =
				new Date().getTime() - latest.recordedAt.getTime();

			if (elapsedMs < DEBOUNCE_WINDOW_MS) {
				if (payload.dealPrice < latest.dealPrice) {
					await updateLatestPriceHistory(latest.id, payload.dealPrice);
				}

				return response(payload.productId, "SKIPPED_DEDUPLICATED");
			}

			const priceDrop =
				(latest.dealPrice - payload.dealPrice) / latest.dealPrice;
			if (priceDrop > MAX_ACCEPTED_PRICE_DROP) {
				return response(
					payload.productId,
					"REJECTED_ANOMALY",
					406,
				);
			}
		}

		await insertPriceHistory({
			productId,
			sellerId,
			dealPrice: payload.dealPrice,
			mrp,
			inStock: payload.inStock,
		});

		return response(payload.productId, "INSERTED_PRICE_CHANGE");
	} catch (error) {
		console.error("Daam ingestion failed.", error);
		return Response.json(
			{ success: false, error: "Unable to ingest product payload." },
			{ status: 500 },
		);
	}
}
