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
	buyBoxPrice?: string[];
	shippingCost?: string[];
	couponDiscount?: string[];
	dealBadge?: string[];
	fulfillment?: string[];
	salesRank?: string[];
	rating?: string[];
	reviewCount?: string[];
	offerCount?: string[];
	lowestNewPrice?: string[];
	brand?: string[];
	categoryPath?: string[];
	imageUrl?: string[];
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

function readFirstValue(selectorList: string[] | undefined): string | null {
	if (!selectorList) {
		return null;
	}
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

function parseNumber(value: string | null): number | null {
	if (!value) {
		return null;
	}

	const match = value.replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
	if (!match) {
		return null;
	}
	const parsed = Number(match[0]);
	return Number.isFinite(parsed) ? parsed : null;
}

function parsePrice(value: string | null): number | null {
	const parsed = parseNumber(value);
	return parsed !== null && parsed > 0 ? Math.round(parsed) : null;
}

function readElement(selectorList: string[] | undefined): Element | null {
	if (!selectorList) {
		return null;
	}
	for (const selector of selectorList) {
		try {
			const element = document.querySelector(selector);
			if (element) {
				return element;
			}
		} catch {
			continue;
		}
	}
	return null;
}

function parseShippingCost(value: string | null): number | null {
	if (!value) {
		return null;
	}
	if (/free delivery|free shipping|delivery is free/i.test(value)) {
		return 0;
	}
	return parsePrice(value);
}

function parseCoupon(value: string | null): number | null {
	if (!value || (/\d\s*%/.test(value) && !/[₹]|\b(?:rs\.?|inr)\b/i.test(value))) {
		return null;
	}
	return parsePrice(value);
}

function parseSalesRank(value: string | null): number | null {
	const rank = value?.match(/#\s*([\d,]+)/)?.[1];
	return rank ? parsePrice(rank) : null;
}

function parseOfferCount(value: string | null): number | null {
	const count =
		value?.match(/([\d,]+)\s+(?:new\s+)?offers?/i)?.[1] ??
		value?.match(/([\d,]+)\s+from/i)?.[1];
	return count ? parsePrice(count) : null;
}

function readBrand(value: string | null): string | null {
	if (!value) {
		return null;
	}
	return (
		value
			.replace(/^visit the\s+/i, "")
			.replace(/\s+store$/i, "")
			.replace(/^brand:\s*/i, "")
			.trim() || null
	);
}

function readCategoryPath(selectorList: string[] | undefined): string[] | null {
	const element = readElement(selectorList);
	if (!element) {
		return null;
	}
	const segments = Array.from(element.querySelectorAll("a"))
		.map((link) => link.textContent?.trim() ?? "")
		.filter(Boolean);
	if (segments.length > 0) {
		return segments;
	}
	const text = element.textContent?.trim();
	const fallback = text
		?.split(/\s*>\s*/)
		.map((part) => part.trim())
		.filter(Boolean);
	return fallback?.length ? fallback : null;
}

function readImageUrl(selectorList: string[] | undefined): string | null {
	const element = readElement(selectorList);
	const rawUrl =
		element?.getAttribute("data-old-hires") ??
		element?.getAttribute("src") ??
		element?.querySelector("img")?.getAttribute("src");
	if (!rawUrl) {
		return null;
	}
	try {
		const url = new URL(rawUrl, location.href);
		return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
	} catch {
		return null;
	}
}

function parseFulfillment(value: string | null): ProductPayload["fulfillmentType"] {
	if (!value) {
		return "unknown";
	}
	const text = value.toLowerCase();
	const soldByAmazon = /sold by\s+(amazon|amazon\.in)/i.test(value);
	const shippedByAmazon = /ships from\s+(amazon|amazon\.in)/i.test(value);
	if (soldByAmazon && shippedByAmazon) {
		return "amazon";
	}
	if (/fulfilled by\s+(amazon|amazon\.in)/i.test(value) || shippedByAmazon) {
		return "fba";
	}
	if (/ships from|fulfilled by/i.test(text)) {
		return "fbm";
	}
	return "unknown";
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

	const dealPrice = parsePrice(
		readFirstValue(amazonSelectors.buyBoxPrice) ?? readFirstValue(amazonSelectors.dealPrice),
	);

	if (dealPrice === null) {
		return {
			status: "unavailable",
			productId,
			reason: "A current price could not be read from this page.",
			errorCode: "PRICE_UNAVAILABLE",
		};
	}

	const inStock =
		!availability || !/currently unavailable|out of stock|unavailable/i.test(availability);
	const sellerContext = readFirstValue(amazonSelectors.sellerContext);
	const fulfillmentText = readFirstValue(amazonSelectors.fulfillment) ?? sellerContext;
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
			mrp: parsePrice(readFirstValue(amazonSelectors.mrp)),
			currency: "INR",
			inStock,
			sellerType,
			brand: readBrand(readFirstValue(amazonSelectors.brand)),
			categoryPath: readCategoryPath(amazonSelectors.categoryPath),
			imageUrl: readImageUrl(amazonSelectors.imageUrl),
			buyBoxPrice: dealPrice,
			listPrice: parsePrice(readFirstValue(amazonSelectors.mrp)),
			couponDiscount: parseCoupon(readFirstValue(amazonSelectors.couponDiscount)),
			shippingCost: parseShippingCost(readFirstValue(amazonSelectors.shippingCost)),
			isLightningDeal: (() => {
				const badge = readFirstValue(amazonSelectors.dealBadge);
				return badge ? /lightning deal/i.test(badge) : undefined;
			})(),
			sellerName: readFirstValue(amazonSelectors.sellerName),
			fulfillmentType: parseFulfillment(fulfillmentText),
			newOfferCount: parseOfferCount(readFirstValue(amazonSelectors.offerCount)),
			lowestNewPrice: parsePrice(readFirstValue(amazonSelectors.lowestNewPrice)),
			salesRank: parseSalesRank(readFirstValue(amazonSelectors.salesRank)),
			rating: parseNumber(readFirstValue(amazonSelectors.rating)),
			reviewCount: parsePrice(readFirstValue(amazonSelectors.reviewCount)),
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
