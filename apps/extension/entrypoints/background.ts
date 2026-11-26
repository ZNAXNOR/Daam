import type { ProductIntelligenceResponse, ProductPayload, StorePlatform } from "@daam/contracts";
import { isProductIntelligenceResponse } from "@daam/contracts";
import { logger } from "../src/logger";

interface ProductMessage {
	type: "DAAM_PRODUCT_EXTRACTED";
	payload: ProductPayload;
}

interface FetchProductIntelligenceMessage {
	type: "FETCH_PRODUCT_INTELLIGENCE";
	platform: StorePlatform;
	productId: string;
	requestId: string;
}

interface CancelProductIntelligenceMessage {
	type: "CANCEL_PRODUCT_INTELLIGENCE";
	requestId: string;
}

type DaamRuntimeMessage =
	| ProductMessage
	| FetchProductIntelligenceMessage
	| CancelProductIntelligenceMessage;

const DEBOUNCE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5_000;
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
const intelligenceRequests = new Map<string, AbortController>();
let pendingFlush: Promise<void> | null = null;

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

async function fetchWithTimeout(endpoint: string, init?: RequestInit): Promise<Response> {
	const controller = new AbortController();
	const parentSignal = init?.signal;
	const abortFromParent = () => controller.abort();
	if (parentSignal?.aborted) {
		controller.abort();
	} else {
		parentSignal?.addEventListener("abort", abortFromParent, { once: true });
	}
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(endpoint, {
			...init,
			signal: controller.signal,
			cache: "no-store",
		});
		const body = await response.arrayBuffer();
		return new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	} finally {
		clearTimeout(timeout);
		parentSignal?.removeEventListener("abort", abortFromParent);
	}
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

async function deferIngestion(key: string, item: PendingIngestion): Promise<boolean> {
	const stored = await browser.storage.local.get(key);
	const current = stored[key] as PendingIngestion | undefined;
	if (current && current.queuedAt !== item.queuedAt) {
		return current.attempts < REQUEST_ATTEMPTS;
	}

	const attempts = item.attempts + 1;
	const retryDelay = Math.min(
		30_000 * 2 ** Math.max(0, Math.min(attempts - 1, 4)),
		MAX_RETRY_DELAY_MS,
	);
	const next = {
		...item,
		attempts,
		nextAttemptAt:
			attempts < REQUEST_ATTEMPTS ? Date.now() + retryDelay : Number.MAX_SAFE_INTEGER,
	};
	await browser.storage.local.set({ [key]: next });
	if (attempts < REQUEST_ATTEMPTS) {
		await scheduleRetry(next.nextAttemptAt);
	}
	return attempts < REQUEST_ATTEMPTS;
}

async function sendPendingIngestion(key: string, item: PendingIngestion): Promise<unknown> {
	try {
		await setSyncStatus("pushing");
		const response = await fetchWithTimeout(`${API_URL}/api/v1/ingest`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(item.payload),
			keepalive: true,
		});

		if (!response.ok) {
			if (isRetryableStatus(response.status)) {
				const willRetry = await deferIngestion(key, item);
				await setSyncStatus(
					"error",
					willRetry ? "API unavailable; retrying" : "Sync retry limit reached",
				);
			} else {
				await removePendingIfCurrent(key, item);
				await setSyncStatus("error", `Sync error (${response.status})`);
			}
			logger.dataSendFailed();
			return {
				success: false,
				status: response.status,
				errorCode: "INGEST_REJECTED",
				reason: `Ingestion failed with status ${response.status}.`,
			};
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
		return result;
	} catch (error) {
		const willRetry = await deferIngestion(key, item);
		await setSyncStatus(
			"error",
			willRetry ? "API unavailable; retrying" : "Sync retry limit reached",
		);
		logger.dataSendFailed();
		return {
			success: false,
			status: 0,
			errorCode: "INGEST_REQUEST_FAILED",
			error: willRetry
				? "Could not reach the ingestion service; retrying."
				: "Could not reach the ingestion service.",
		};
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
			if (item.attempts < REQUEST_ATTEMPTS && item.nextAttemptAt <= Date.now()) {
				await processPendingIngestion(key, item);
			}
		}

		const remaining = await browser.storage.local.get(null);
		const nextRetry = Object.entries(remaining)
			.filter(([key]) => key.startsWith(PENDING_INGESTION_PREFIX))
			.filter(([, value]) => (value as PendingIngestion).attempts < REQUEST_ATTEMPTS)
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
		if (message.type === "CANCEL_PRODUCT_INTELLIGENCE") {
			intelligenceRequests.get(message.requestId)?.abort();
			return;
		}

		if (message.type === "FETCH_PRODUCT_INTELLIGENCE") {
			const endpoint =
				`${API_URL}/api/v1/product/` +
				`${encodeURIComponent(message.platform)}/` +
				`${encodeURIComponent(message.productId)}`;

			const controller = new AbortController();
			intelligenceRequests.set(message.requestId, controller);
			try {
				const response = await fetchWithTimeout(endpoint, { signal: controller.signal });
				if (response.status === 404) {
					return null;
				}
				if (!response.ok) {
					logger.dataFetchFailed();
					return {
						errorCode: "PRODUCT_FETCH_REJECTED",
						reason: `Price history request failed with status ${response.status}.`,
					};
				}

				const result: unknown = await response.json();
				if (!isProductIntelligenceResponse(result)) {
					logger.dataFetchFailed();
					return {
						errorCode: "PRODUCT_FETCH_INVALID",
						reason: "The price history response was invalid.",
					};
				}

				return result satisfies ProductIntelligenceResponse;
			} catch {
				if (!controller.signal.aborted) {
					logger.dataFetchFailed();
					return {
						errorCode: "PRODUCT_FETCH_FAILED",
						reason: "Could not reach the price history service within 5 seconds.",
					};
				}
				return null;
			} finally {
				if (intelligenceRequests.get(message.requestId) === controller) {
					intelligenceRequests.delete(message.requestId);
				}
			}
		}

		if (message.type !== "DAAM_PRODUCT_EXTRACTED") {
			return;
		}

		return enqueueIngestion(message.payload);
	});
});
