import type { ProductPayload } from "../src/contracts/product";
import type { DaamRuntimeMessage } from "../src/harvesting/messages";

export default defineBackground(() => {
	const queue: ProductPayload[] = [];

	browser.runtime.onMessage.addListener((message: DaamRuntimeMessage) => {
		if (message.type !== "DAAM_HARVEST_PRODUCTS") {
			return;
		}

		queue.push(...message.payloads);
	});

	setInterval(() => {
		if (queue.length === 0) {
			return;
		}

		const batch = queue.splice(0, queue.length);
		console.info("Daam local harvest batch", {
			count: batch.length,
			products: batch,
		});
	}, 15_000);

	console.info("Daam background sensor active", { id: browser.runtime.id });
});
