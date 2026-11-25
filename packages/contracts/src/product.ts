export type StorePlatform =
	| "amazon_in"
	| "amazon_com"
	| "amazon_uk"
	| "amazon_de"
	| "amazon_ca"
	| "amazon_jp"
	| "amazon_au"
	| "flipkart"
	| "walmart"
	| "target";

export type ExtractionMethod = "ld_json" | "main_state" | "dom_selector";

export interface ProductPayload {
	platform: StorePlatform;
	productId: string;
	title: string;
	dealPrice: number;
	mrp?: number | null;
	currency: string;
	couponDiscount?: number;
	inStock: boolean;
	sellerName?: string | null;
	sellerId?: string | null;
	imageHash?: string;
	extractionMethod: ExtractionMethod;
	timestamp: number;
}

export type IngestionAction =
	| "INSERTED_PRICE_CHANGE"
	| "SKIPPED_DEDUPLICATED"
	| "REJECTED_ANOMALY";

export interface IngestionResponse {
	success: boolean;
	action: IngestionAction;
	productId: string;
}

export type ProductVerdictCode =
	| "tracking_started"
	| "lowest_seen"
	| "highest_seen"
	| "steady"
	| "true_deal"
	| "fair_price"
	| "inflated";

export type ProductVerdictTone = "neutral" | "positive" | "warning" | "negative";

export interface ProductVerdict {
	code: ProductVerdictCode;
	label: string;
	tone: ProductVerdictTone;
}

export interface ProductIntelligenceStats {
	currentPrice: number;
	minPrice: number;
	maxPrice: number;
	medianPrice: number;
	dataPoints: number;
}

export interface ProductIntelligenceHistoryPoint {
	timestamp: string;
	effectivePrice: number;
	mrp?: number;
}

export interface ProductIntelligenceResponse {
	verdict: ProductVerdict;
	stats: ProductIntelligenceStats;
	history: ProductIntelligenceHistoryPoint[];
}

export type ProductValidationCode =
	| "INVALID_PRODUCT_ID"
	| "INVALID_DEAL_PRICE"
	| "INVALID_MRP"
	| "DEAL_PRICE_EXCEEDS_MRP"
	| "INVALID_COUPON"
	| "COUPON_EXCEEDS_DEAL_PRICE"
	| "INVALID_CURRENCY"
	| "INVALID_IMAGE_HASH"
	| "INVALID_TIMESTAMP";

export interface ProductValidationResult {
	valid: boolean;
	errors: ProductValidationCode[];
}

const IMAGE_HASH_PATTERN = /^[0-9a-f]{16}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

const VERDICT_CODES: ProductVerdictCode[] = [
	"tracking_started",
	"lowest_seen",
	"highest_seen",
	"steady",
	"true_deal",
	"fair_price",
	"inflated",
];
const VERDICT_TONES: ProductVerdictTone[] = [
	"neutral",
	"positive",
	"warning",
	"negative",
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function isProductIntelligenceResponse(
	value: unknown,
): value is ProductIntelligenceResponse {
	if (!isRecord(value) || !isRecord(value.verdict) || !isRecord(value.stats)) {
		return false;
	}

	const { verdict, stats } = value;
	if (
		typeof verdict.code !== "string" ||
		!VERDICT_CODES.includes(verdict.code as ProductVerdictCode) ||
		typeof verdict.label !== "string" ||
		typeof verdict.tone !== "string" ||
		!VERDICT_TONES.includes(verdict.tone as ProductVerdictTone) ||
		typeof stats.currentPrice !== "number" ||
		!Number.isFinite(stats.currentPrice) ||
		typeof stats.minPrice !== "number" ||
		!Number.isFinite(stats.minPrice) ||
		typeof stats.maxPrice !== "number" ||
		!Number.isFinite(stats.maxPrice) ||
		typeof stats.medianPrice !== "number" ||
		!Number.isFinite(stats.medianPrice) ||
		typeof stats.dataPoints !== "number" ||
		!Number.isInteger(stats.dataPoints) ||
		!Array.isArray(value.history)
	) {
		return false;
	}

	return value.history.every((point: unknown) => {
		if (!isRecord(point)) {
			return false;
		}

		return (
			typeof point.timestamp === "string" &&
			Number.isFinite(Date.parse(point.timestamp)) &&
			typeof point.effectivePrice === "number" &&
			Number.isFinite(point.effectivePrice) &&
			(point.mrp === undefined ||
				(typeof point.mrp === "number" && Number.isFinite(point.mrp)))
		);
	});
}

export function validateProductPayload(
	payload: ProductPayload,
): ProductValidationResult {
	const errors: ProductValidationCode[] = [];

	if (!payload.productId.trim()) {
		errors.push("INVALID_PRODUCT_ID");
	}

	if (!Number.isFinite(payload.dealPrice) || payload.dealPrice <= 0) {
		errors.push("INVALID_DEAL_PRICE");
	}

	if (payload.mrp !== undefined && payload.mrp !== null) {
		if (!Number.isFinite(payload.mrp) || payload.mrp <= 0) {
			errors.push("INVALID_MRP");
		} else if (payload.dealPrice > payload.mrp * 1.05) {
			errors.push("DEAL_PRICE_EXCEEDS_MRP");
		}
	}

	if (
		payload.couponDiscount !== undefined &&
		(!Number.isFinite(payload.couponDiscount) || payload.couponDiscount < 0)
	) {
		errors.push("INVALID_COUPON");
	} else if (
		payload.couponDiscount !== undefined &&
		payload.couponDiscount > payload.dealPrice
	) {
		errors.push("COUPON_EXCEEDS_DEAL_PRICE");
	}

	if (!CURRENCY_PATTERN.test(payload.currency)) {
		errors.push("INVALID_CURRENCY");
	}

	if (payload.imageHash !== undefined && !IMAGE_HASH_PATTERN.test(payload.imageHash)) {
		errors.push("INVALID_IMAGE_HASH");
	}

	if (!Number.isFinite(payload.timestamp) || payload.timestamp <= 0) {
		errors.push("INVALID_TIMESTAMP");
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}
