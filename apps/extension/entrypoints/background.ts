import type { ProductIntelligenceResponse, ProductPayload, StorePlatform } from "@daam/contracts";
import { isProductIntelligenceResponse } from "@daam/contracts";

interface ProductMessage {
	type: "DAAM_PRODUCT_EXTRACTED";
	payload: ProductPayload;
}

interface FetchProductIntelligenceMessage {
	type: "FETCH_PRODUCT_INTELLIGENCE";
	platform: StorePlatform;
	productId: string;
}

type DaamRuntimeMessage = ProductMessage | FetchProductIntelligenceMessage;

const DEBOUNCE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const REQUEST_ATTEMPTS = 3;
const RETRY_ALARM = "daam-ingestion-retry";
const PENDING_INGESTION_PREFIX = "daam:pending-ingestion:";
const MIN_ALARM_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
const API_URL = (import.meta.env.WXT_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

interface SyncStatus {
	stage: "idle" | "pushing" | "pushed" | "error";
	message?: string;
	updatedAt: number;
}

interface PendingIngestion {
	payload: ProductPayload;
	queuedAt: number;
	attempts: number;
	nextAttemptAt: number;
}

const inFlightIngestions = new Map<string, Promise<unknown>>();
let pendingFlush: Promise<void> | null = null;

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

async function fetchWithTimeout(endpoint: string, init?: RequestInit): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		return await fetch(endpoint, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchWithRetry(endpoint: string, init?: RequestInit): Promise<Response> {
	for (let attempt = 0; attempt < REQUEST_ATTEMPTS; attempt += 1) {
		try {
			const response = await fetchWithTimeout(endpoint, init);
			if (!isRetryableStatus(response.status) || attempt === REQUEST_ATTEMPTS - 1) {
				return response;
			}
			if (response.body) {
				await response.body.cancel().catch(() => undefined);
			}
		} catch (error) {
			if (attempt === REQUEST_ATTEMPTS - 1) {
				throw error;
			}
		}
		await delay(400 * 2 ** attempt);
	}
	throw new Error("Request retry limit reached");
}

function pendingKey(payload: ProductPayload): string {
	return `${PENDING_INGESTION_PREFIX}${encodeURIComponent(payload.platform)}:${encodeURIComponent(payload.productId)}`;
}

async function scheduleRetry(when: number): Promise<void> {
	await browser.alarms.create(RETRY_ALARM, {
		when: Math.max(when, Date.now() + MIN_ALARM_DELAY_MS),
	});
}

async function removePendingIfCurrent(key: string, item: PendingIngestion): Promise<void> {
	const stored = await browser.storage.local.get(key);
	const current = stored[key] as PendingIngestion | undefined;
	if (current?.queuedAt === item.queuedAt) {
		await browser.storage.local.remove(key);
	}
}

async function deferIngestion(key: string, item: PendingIngestion): Promise<void> {
	const stored = await browser.storage.local.get(key);
	const current = stored[key] as PendingIngestion | undefined;
	const latest = current ?? item;
	const attempts = latest.queuedAt === item.queuedAt ? latest.attempts + 1 : latest.attempts;
	const retryDelay = Math.min(
		30_000 * 2 ** Math.max(0, Math.min(attempts - 1, 4)),
		MAX_RETRY_DELAY_MS,
	);
	const next = {
		...latest,
		attempts,
		nextAttemptAt: Date.now() + retryDelay,
	};
	await browser.storage.local.set({ [key]: next });
	await scheduleRetry(next.nextAttemptAt);
}

async function sendPendingIngestion(key: string, item: PendingIngestion): Promise<unknown> {
	try {
		await setSyncStatus("pushing");
		const response = await fetchWithRetry(`${API_URL}/api/v1/ingest`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(item.payload),
		});

		if (!response.ok) {
			const details = await response.text();
			if (isRetryableStatus(response.status)) {
				await deferIngestion(key, item);
				await setSyncStatus("error", "API unavailable; retrying");
			} else {
				await removePendingIfCurrent(key, item);
				await setSyncStatus("error", `Sync error (${response.status})`);
			}
			console.error("[Daam] ingestion rejected", {
				status: response.status,
				details,
				productId: item.payload.productId,
			});
			return { success: false, status: response.status, details };
		}

		const result = (await response.json()) as {
			success: boolean;
			action: string;
			productId: string;
		};
		await removePendingIfCurrent(key, item);
		await browser.storage.session.set({
			[`daam:last-sent:${item.payload.platform}:${item.payload.productId}`]: Date.now(),
		});
		await setSyncStatus("pushed");
		console.info("[Daam] ingestion succeeded", result);
		return result;
	} catch (error) {
		await deferIngestion(key, item);
		await setSyncStatus("error", "API unavailable; retrying");
		console.error("[Daam] unable to reach ingestion API", {
			apiUrl: API_URL,
			productId: item.payload.productId,
			error,
		});
		return { success: false, status: 0, error: "API unreachable; retrying" };
	}
}

function processPendingIngestion(key: string, item: PendingIngestion): Promise<unknown> {
	const existing = inFlightIngestions.get(key);
	if (existing) {
		return existing;
	}
	const request = sendPendingIngestion(key, item).finally(() => {
		inFlightIngestions.delete(key);
	});
	inFlightIngestions.set(key, request);
	return request;
}

async function enqueueIngestion(payload: ProductPayload): Promise<unknown> {
	const key = pendingKey(payload);
	const stored = await browser.storage.local.get(key);
	const pending = stored[key] as PendingIngestion | undefined;
	const lastSentKey = `daam:last-sent:${payload.platform}:${payload.productId}`;
	const lastSent = (await browser.storage.session.get(lastSentKey))[lastSentKey];
	if (!pending && typeof lastSent === "number" && Date.now() - lastSent < DEBOUNCE_MS) {
		return { success: true, skipped: true };
	}

	const item: PendingIngestion = {
		payload,
		queuedAt: Date.now(),
		attempts: 0,
		nextAttemptAt: Date.now(),
	};
	await browser.storage.local.set({ [key]: item });
	await scheduleRetry(Date.now() + MIN_ALARM_DELAY_MS);
	return processPendingIngestion(key, item);
}

async function flushPendingIngestions(): Promise<void> {
	if (pendingFlush) {
		return pendingFlush;
	}
	const flush = (async () => {
		const stored = await browser.storage.local.get(null);
		const pendingEntries = Object.entries(stored).filter(([key]) =>
			key.startsWith(PENDING_INGESTION_PREFIX),
		);
		for (const [key, value] of pendingEntries) {
			const item = value as PendingIngestion;
			if (item.nextAttemptAt <= Date.now()) {
				await processPendingIngestion(key, item);
			}
		}

		const remaining = await browser.storage.local.get(null);
		const nextRetry = Object.entries(remaining)
			.filter(([key]) => key.startsWith(PENDING_INGESTION_PREFIX))
			.map(([, value]) => (value as PendingIngestion).nextAttemptAt)
			.filter((time) => Number.isFinite(time))
			.sort((left, right) => left - right)[0];
		if (nextRetry === undefined) {
			await browser.alarms.clear(RETRY_ALARM);
		} else {
			await scheduleRetry(nextRetry);
		}
	})();
	pendingFlush = flush;
	try {
		await flush;
	} finally {
		pendingFlush = null;
	}
}

async function setSyncStatus(stage: SyncStatus["stage"], message?: string): Promise<void> {
	await browser.storage.local.set({
		daam_sync_status: {
			stage,
			message,
			updatedAt: Date.now(),
		} satisfies SyncStatus,
	});
}

export default defineBackground(() => {
	browser.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name === RETRY_ALARM) {
			void flushPendingIngestions();
		}
	});
	browser.runtime.onStartup.addListener(() => {
		void flushPendingIngestions();
	});
	browser.runtime.onInstalled.addListener(() => {
		void flushPendingIngestions();
	});
	void flushPendingIngestions();

	browser.runtime.onMessage.addListener(async (message: DaamRuntimeMessage) => {
		if (message.type === "FETCH_PRODUCT_INTELLIGENCE") {
			const endpoint =
				`${API_URL}/api/v1/product/` +
				`${encodeURIComponent(message.platform)}/` +
				`${encodeURIComponent(message.productId)}`;

			try {
				const response = await fetchWithRetry(endpoint);
				if (response.status === 404) {
					console.info("[Daam] no product history is available yet", {
						productId: message.productId,
					});
					return null;
				}
				if (!response.ok) {
					const details = await response.text();
					console.error("[Daam] product intelligence request failed", {
						status: response.status,
						details,
						productId: message.productId,
					});
					return null;
				}

				const result: unknown = await response.json();
				if (!isProductIntelligenceResponse(result)) {
					console.error("[Daam] product intelligence response was invalid", {
						productId: message.productId,
					});
					return null;
				}

				return result satisfies ProductIntelligenceResponse;
			} catch (error) {
				console.error("[Daam] unable to fetch product intelligence", {
					apiUrl: API_URL,
					productId: message.productId,
					error,
				});
				return null;
			}
		}

		if (message.type !== "DAAM_PRODUCT_EXTRACTED") {
			return;
		}

		return enqueueIngestion(message.payload);
	});
});
