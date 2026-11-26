import type { ProductPayload } from "@daam/contracts";
import { loadSelectors } from "../config/selectorLoader";

interface AmazonSelectors {
	asin: string[];
	title: string[];
	dealPrice: string[];
	mrp: string[];
	merchantId: string[];
	sellerName: string[];
	sellerContext: string[];
	availability: string[];
}

export type AmazonExtractionResult =
	| { status: "ready"; payload: ProductPayload }
	| { status: "unavailable"; productId: string | null; reason: string; errorCode: string };

function readElementValue(element: Element): string | null {
	if (element instanceof HTMLInputElement) {
		return element.value.trim() || null;
	}

	return (
		element.getAttribute("data-asin")?.trim() ||
		element.getAttribute("data-merchant-id")?.trim() ||
		element.textContent?.trim() ||
		null
	);
}

function readFirstValue(selectorList: string[]): string | null {
	for (const selector of selectorList) {
		try {
			const element = document.querySelector(selector);
			const value = element ? readElementValue(element) : null;
			if (value) {
				return value;
			}
		} catch {
			continue;
		}
	}
	return null;
}

function parseInteger(value: string | null): number | null {
	if (!value) {
		return null;
	}

	const numericValue = value.replace(/[^\d.]/g, "");
	const parsed = Number(numericValue);
	return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export async function inspectAmazonPage(
	selectors?: AmazonSelectors,
): Promise<AmazonExtractionResult> {
	const amazonSelectors = selectors ?? (await loadSelectors()).amazon_in;
	const productId =
		readFirstValue(amazonSelectors.asin) ??
		location.pathname.match(/\/dp\/([A-Z0-9]{10})(?:\/|$)/i)?.[1] ??
		null;
	const availability = readFirstValue(amazonSelectors.availability);
	if (availability && /currently unavailable|out of stock|unavailable/i.test(availability)) {
		return {
			status: "unavailable",
			productId,
			reason: "This item is currently out of stock.",
			errorCode: "OUT_OF_STOCK",
		};
	}
	if (!productId) {
		return {
			status: "unavailable",
			productId: null,
			reason: "Daam could not identify this product on the page.",
			errorCode: "PRODUCT_ID_UNAVAILABLE",
		};
	}

	const dealPrice = parseInteger(readFirstValue(amazonSelectors.dealPrice));

	if (dealPrice === null) {
		return {
			status: "unavailable",
			productId,
			reason: "A current price could not be read from this page.",
			errorCode: "PRICE_UNAVAILABLE",
		};
	}

	const inStock = true;
	const sellerContext = readFirstValue(amazonSelectors.sellerContext);
	const sellerType =
		sellerContext && /ships from amazon|fulfilled by amazon|sold by amazon/i.test(sellerContext)
			? "platform"
			: sellerContext
				? "third_party"
				: "unknown";

	return {
		status: "ready",
		payload: {
			platform: "amazon_in",
			productId,
			title: readFirstValue(amazonSelectors.title) ?? "",
			dealPrice,
			mrp: parseInteger(readFirstValue(amazonSelectors.mrp)),
			currency: "INR",
			inStock,
			sellerType,
			sellerName: readFirstValue(amazonSelectors.sellerName),
			sellerId: readFirstValue(amazonSelectors.merchantId),
			extractionMethod: "dom_selector",
			timestamp: Date.now(),
		},
	};
}

export async function extractAmazonData(
	selectors?: AmazonSelectors,
): Promise<ProductPayload | null> {
	const result = await inspectAmazonPage(selectors);
	return result.status === "ready" ? result.payload : null;
}
