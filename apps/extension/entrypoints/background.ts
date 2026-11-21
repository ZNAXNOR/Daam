import type { ProductPayload } from "@daam/contracts";

interface ProductMessage {
	type: "DAAM_PRODUCT_EXTRACTED";
	payload: ProductPayload;
}

const DEBOUNCE_MS = 5 * 60 * 1000;
const API_URL = (
	import.meta.env.WXT_API_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

interface SyncStatus {
	stage: "idle" | "pushing" | "pushed" | "error";
	message?: string;
	updatedAt: number;
}

async function setSyncStatus(
	stage: SyncStatus["stage"],
	message?: string,
): Promise<void> {
	await browser.storage.local.set({
		daam_sync_status: {
			stage,
			message,
			updatedAt: Date.now(),
		} satisfies SyncStatus,
	});
}

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

		try {
			await setSyncStatus("pushing");
			const response = await fetch(`${API_URL}/api/v1/ingest`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(message.payload),
			});

			if (!response.ok) {
				const details = await response.text();
				await setSyncStatus("error", `Sync error (${response.status})`);
				console.error("[Daam] ingestion rejected", {
					status: response.status,
					details,
					productId: message.payload.productId,
				});
				return {
					success: false,
					status: response.status,
					details,
				};
			}

			const result = await response.json() as {
				success: boolean;
				action: string;
				productId: string;
			};
			await browser.storage.session.set({ [key]: Date.now() });
			await setSyncStatus("pushed");
			console.info("[Daam] ingestion succeeded", result);
			return result;
		} catch (error) {
			await setSyncStatus("error", "API unreachable");
			console.error("[Daam] unable to reach ingestion API", {
				apiUrl: API_URL,
				productId: message.payload.productId,
				error,
			});
			return {
				success: false,
				status: 0,
				error: "API unreachable",
			};
		}
	});
});
