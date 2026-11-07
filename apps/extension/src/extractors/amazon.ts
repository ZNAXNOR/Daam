import selectors from "../config/selectors.json";
import type { ProductPayload } from "@daam/contracts";

interface AmazonSelectors {
	asin: string[];
	title: string[];
	dealPrice: string[];
	mrp: string[];
	merchantId: string[];
	sellerName: string[];
	availability: string[];
}

const amazonSelectors = selectors.amazon_in as AmazonSelectors;

function readElementValue(element: Element): string | null {
	if (element instanceof HTMLInputElement) {
		return element.value.trim() || null;
	}

	return element.getAttribute("data-asin")?.trim() || element.getAttribute("data-merchant-id")?.trim()
		|| element.textContent?.trim() || null;
}

function readFirstValue(selectorList: string[]): string | null {
	for (const selector of selectorList) {
		try {
			const element = document.querySelector(selector);
			const value = element ? readElementValue(element) : null;
			if (value) {
				return value;
			}
		} catch (error) {
			console.warn("Daam ignored invalid Amazon selector", { selector, error });
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

export async function extractAmazonData(): Promise<ProductPayload | null> {
	const productId = readFirstValue(amazonSelectors.asin);
	const dealPrice = parseInteger(readFirstValue(amazonSelectors.dealPrice));

	if (!productId || dealPrice === null) {
		return null;
	}

	const availability = readFirstValue(amazonSelectors.availability);
	const inStock = !availability || !/currently unavailable|out of stock|unavailable/i.test(availability);

	return {
		platform: "amazon_in",
		productId,
		title: readFirstValue(amazonSelectors.title) ?? "",
		dealPrice,
		mrp: parseInteger(readFirstValue(amazonSelectors.mrp)),
		currency: "INR",
		inStock,
		sellerName: readFirstValue(amazonSelectors.sellerName),
		sellerId: readFirstValue(amazonSelectors.merchantId),
		extractionMethod: "dom_selector",
		timestamp: Date.now(),
	};
}
