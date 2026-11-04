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
	mrp?: number;
	currency: string;
	couponDiscount?: number;
	inStock: boolean;
	sellerName?: string;
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

	if (payload.mrp !== undefined) {
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
