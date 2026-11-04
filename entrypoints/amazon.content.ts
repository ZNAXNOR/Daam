import { extractAmazonData } from "../src/extractors/amazon";
import { createAssistChip } from "../src/ui/AssistChip";
import { harvestAmazonSearchPage } from "../src/extractors/amazon";

async function waitFor<T>(
	load: () => Promise<T | null>,
	attempts = 30,
	delayMs = 1000,
): Promise<T | null> {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const result = await load();
		if (result !== null) {
			return result;
		}
		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}
	return null;
}

export default defineContentScript({
	matches: [
		"*://*.amazon.in/*",
		"*://*.amazon.com/*",
		"*://*.amazon.co.uk/*",
		"*://*.amazon.de/*",
		"*://*.amazon.ca/*",
		"*://*.amazon.co.jp/*",
		"*://*.amazon.com.au/*",
	],

	async main() {
		console.info("Daam Amazon content script loaded", {
			hostname: window.location.hostname,
			pathname: window.location.pathname,
		});

		if (location.pathname === "/s" || location.pathname.startsWith("/s/")) {
			const payloads = await waitFor(async () => {
				const products = await harvestAmazonSearchPage(window.location.hostname);
				return products.length > 0 ? products : null;
			}) ?? [];
			if (payloads.length > 0) {
				await browser.runtime.sendMessage({
					type: "DAAM_HARVEST_PRODUCTS",
					payloads,
				});
			}
			console.info("Daam Amazon search harvest", { count: payloads.length });
			return;
		}

		const isProductPage = /\/dp\/|\/gp\/product\//.test(window.location.pathname);
		if (!isProductPage) {
			return;
		}

		const data = await waitFor(() => extractAmazonData(window.location.hostname));
		if (!data) {
			console.info("Daam could not find a supported Amazon product snapshot", {
				url: location.href,
				hostname: window.location.hostname,
				asin: document.querySelector<HTMLInputElement>("#ASIN")?.value ?? null,
				roots: {
					apex: Boolean(document.querySelector("#apex_desktop")),
					center: Boolean(document.querySelector("#centerCol")),
				},
				priceInput: document.querySelector<HTMLInputElement>(
					"input[name='items[0.base][customerVisiblePrice][amount]']",
				)?.value ?? null,
				priceDisplay: document.querySelector(
					".apex-pricetopay-value, .priceToPay .a-offscreen",
				)?.textContent?.trim() ?? null,
			});
			return;
		}

		const anchor = document.querySelector<HTMLElement>(
			"#corePriceDisplay_desktop_feature_div, #desktop_unifiedPrice, #centerCol",
		);
		if (!anchor || anchor.querySelector("[data-daam-chip]")) {
			console.info("Daam found data but could not find a unique price anchor", {
				url: location.href,
			});
			return;
		}

		anchor.before(createAssistChip(data));
	},
});
