import type { ProductPayload } from "../src/extractors/amazon";

interface ProductMessage {
	type: "DAAM_PRODUCT_EXTRACTED";
	payload: ProductPayload;
}

const DEBOUNCE_MS = 5 * 60 * 1000;

export default defineBackground(() => {
	browser.runtime.onMessage.addListener(async (message: ProductMessage) => {
		if (message.type !== "DAAM_PRODUCT_EXTRACTED") {
			return;
		}

		const key = `daam:last-sent:${message.payload.productId}`;
		const stored = await browser.storage.session.get(key);
		const lastSent = stored[key];
		if (typeof lastSent === "number" && Date.now() - lastSent < DEBOUNCE_MS) {
			return;
		}

		await browser.storage.session.set({ [key]: Date.now() });
		console.info("Daam product payload ready for backend", message.payload);
	});
});
