import type { ProductPayload, StorePlatform } from "../contracts/product";
import { validateProductPayload } from "../contracts/product";
import selectors from "../config/selectors.json";
import { computeDHash } from "../hashing/dhash";

export type AmazonData = ProductPayload & {
	sellerId: string | null;
};

type JsonValue = JsonValue[] | { [key: string]: JsonValue } | number | string | boolean | null;

interface AmazonSelectors {
	asin: string[];
	merchantId: string[];
	dealPrice: string[];
	mrp: string[];
	productRoots: string[];
	title: string[];
	sellerName: string[];
	availability: string[];
	image: string[];
	couponMetadata: string[];
	searchCards: string[];
	searchTitle: string[];
	searchPrice: string[];
	exchangeState: string[];
}

interface SelectorConfig {
	amazon: {
		default: AmazonSelectors;
		overrides: Partial<Record<string, Partial<AmazonSelectors>>>;
	};
}

const selectorConfig = selectors as SelectorConfig;

function getAmazonSelectors(selectorKey: string): AmazonSelectors {
	return {
		...selectorConfig.amazon.default,
		...selectorConfig.amazon.overrides[selectorKey],
	};
}

function parsePrice(value: string | null | undefined): number | null {
	if (!value) {
		return null;
	}

	const match = value.match(/\d[\d,]*(?:\.\d+)?/);
	if (!match) {
		return null;
	}

	const parsed = Number(match[0].replace(/,/g, ""));
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getElement(selectorsToTry: string[], root: ParentNode = document): Element | null {
	for (const selector of selectorsToTry) {
		const element = root.querySelector(selector);
		if (element) {
			return element;
		}
	}
	return null;
}

function getElementFromRootOrDocument(
	selectorsToTry: string[],
	root: Element,
): Element | null {
	return getElement(selectorsToTry, root) ?? getElement(selectorsToTry);
}

function getValue(selectorsToTry: string[]): string | null {
	const element = getElement(selectorsToTry);
	if (!element) {
		return null;
	}

	const value = element instanceof HTMLInputElement ? element.value : element.textContent;
	return value?.trim() || null;
}

function findNumber(value: JsonValue, keys: Set<string>): number | null {
	if (Array.isArray(value)) {
		for (const item of value) {
			const result = findNumber(item, keys);
			if (result !== null) {
				return result;
			}
		}
		return null;
	}

	if (value && typeof value === "object") {
		for (const [key, nestedValue] of Object.entries(value)) {
			if (keys.has(key.toLowerCase())) {
				const parsed = typeof nestedValue === "number"
					? nestedValue
					: parsePrice(typeof nestedValue === "string" ? nestedValue : null);
				if (parsed !== null) {
					return parsed;
				}
			}

			const result = findNumber(nestedValue, keys);
			if (result !== null) {
				return result;
			}
		}
	}

	return null;
}

function getCouponDiscount(
	root: Element,
	dealPrice: number,
	amazonSelectors: AmazonSelectors,
): number | undefined {
	for (const element of root.querySelectorAll<HTMLElement>(
		amazonSelectors.couponMetadata.join(","),
	)) {
		try {
			const modalData = JSON.parse(element.dataset.aModal ?? "") as JsonValue;
			const discount = findNumber(
				modalData,
				new Set(["coupondiscount", "discountamount", "couponamount"]),
			);
			if (discount !== null && discount > 0 && discount <= dealPrice) {
				return discount;
			}
		} catch {
			// Ignore unrelated or malformed modal metadata.
		}
	}
	return undefined;
}

function isExchangeActive(root: Element, amazonSelectors: AmazonSelectors): boolean {
	const candidates = root.querySelectorAll<HTMLElement>(
		amazonSelectors.exchangeState.join(","),
	);
	return Array.from(candidates).some((element) => {
		const label = element.textContent?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
		return label.includes("with exchange") && (
			element.getAttribute("aria-selected") === "true" ||
			element.classList.contains("a-tab-active") ||
			element.classList.contains("selected")
		);
	});
}

function getPlatform(hostname: string): {
	platform: StorePlatform;
	currency: string;
	selectorKey: string;
} | null {
	const normalizedHostname = hostname.toLowerCase().replace(/^www\./, "");
	const domains: Record<string, { platform: StorePlatform; currency: string; selectorKey: string }> = {
		"amazon.in": { platform: "amazon_in", currency: "INR", selectorKey: "default" },
		"amazon.com": { platform: "amazon_com", currency: "USD", selectorKey: "default" },
		"amazon.co.uk": { platform: "amazon_uk", currency: "GBP", selectorKey: "amazon_co_uk" },
		"amazon.de": { platform: "amazon_de", currency: "EUR", selectorKey: "default" },
		"amazon.ca": { platform: "amazon_ca", currency: "CAD", selectorKey: "default" },
		"amazon.co.jp": { platform: "amazon_jp", currency: "JPY", selectorKey: "default" },
		"amazon.com.au": { platform: "amazon_au", currency: "AUD", selectorKey: "default" },
	};
	return domains[normalizedHostname] ?? null;
}

export async function extractAmazonData(hostname: string): Promise<AmazonData | null> {
	try {
		const market = getPlatform(hostname);
		if (!market) {
			return null;
		}
		const amazonSelectors = getAmazonSelectors(market.selectorKey);

		const asin = getValue(amazonSelectors.asin);
		if (!asin) {
			return null;
		}

		const root = getElement(amazonSelectors.productRoots) as HTMLElement | null;
		if (!root || isExchangeActive(root, amazonSelectors)) {
			return null;
		}

		const dealPriceElement = getElementFromRootOrDocument(amazonSelectors.dealPrice, root);
		const dealPrice = parsePrice(
			dealPriceElement instanceof HTMLInputElement
				? dealPriceElement.value
				: dealPriceElement?.textContent,
		);
		if (dealPrice === null) {
			return null;
		}

		const mrp = parsePrice(
			getElementFromRootOrDocument(amazonSelectors.mrp, root)?.textContent,
		);
		const availability = getElementFromRootOrDocument(amazonSelectors.availability, root);
		const inStock = !availability || !/currently unavailable|out of stock|unavailable/i.test(
			availability.textContent ?? "",
		);
		const image = getElement(amazonSelectors.image) as HTMLImageElement | null;
		let imageHash: string | undefined;
		if (image?.complete && image.naturalWidth > 0) {
			try {
				imageHash = computeDHash(image);
			} catch {
				imageHash = undefined;
			}
		}

		const sellerName = getValue(amazonSelectors.sellerName);
		const couponDiscount = getCouponDiscount(root, dealPrice, amazonSelectors);
		const payload: AmazonData = {
			platform: market.platform,
			productId: asin,
			title: getValue(amazonSelectors.title) ?? "",
			dealPrice,
			...(mrp === null ? {} : { mrp }),
			currency: market.currency,
			...(couponDiscount === undefined ? {} : { couponDiscount }),
			inStock,
			...(imageHash ? { imageHash } : {}),
			...(sellerName ? { sellerName } : {}),
			extractionMethod: "dom_selector",
			timestamp: Date.now(),
			sellerId: getValue(amazonSelectors.merchantId),
		};

		return validateProductPayload(payload).valid ? payload : null;
	} catch (error) {
		console.error("Daam Amazon extraction failed", error);
		return null;
	}
}

export async function harvestAmazonSearchPage(hostname: string): Promise<ProductPayload[]> {
	const market = getPlatform(hostname);
	if (!market) {
		return [];
	}
	const amazonSelectors = getAmazonSelectors(market.selectorKey);

	const cards = Array.from(document.querySelectorAll<HTMLElement>(
		amazonSelectors.searchCards.join(","),
	)).slice(0, 42);
	const products: ProductPayload[] = [];

	for (const card of cards) {
		const productId = card.dataset.asin?.trim();
		const dealPrice = parsePrice(getElement(amazonSelectors.searchPrice, card)?.textContent);
		if (!productId || dealPrice === null) {
			continue;
		}

		const payload: ProductPayload = {
			platform: market.platform,
			productId,
			title: getElement(amazonSelectors.searchTitle, card)?.textContent?.trim() ?? "",
			dealPrice,
			currency: market.currency,
			inStock: true,
			extractionMethod: "dom_selector",
			timestamp: Date.now(),
		};

		if (validateProductPayload(payload).valid) {
			products.push(payload);
		}
	}

	return products;
}
