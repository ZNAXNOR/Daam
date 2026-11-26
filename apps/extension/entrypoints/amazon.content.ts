import type { ProductIntelligenceResponse, ProductPayload } from "@daam/contracts";
import { isProductIntelligenceResponse } from "@daam/contracts";
import { loadSelectors } from "../src/config/selectorLoader";
import { inspectAmazonPage } from "../src/extractors/amazon";
import { Chip, type ChipContext, type ChipState } from "../src/ui/components/Chip";
import { logger } from "../src/logger";
import { watchForChanges } from "../src/utils/observer";

const CHIP_HOST_ID = "daam-chip-host";
const SELECTOR_VERSION = "bundled-v1";
const PRIMARY_ANCHOR = "#corePriceDisplay_desktop_feature_div";
const FALLBACK_ANCHORS = ["#corePrice_feature_div", "#apex_desktop", "#title"];
const ANCHOR_TIMEOUT_MS = 4_000;

export default defineContentScript({
	matches: ["*://*.amazon.in/dp/*", "*://*.amazon.in/*/dp/*"],
	async main() {
		let chip: Chip | null = null;
		let chipHost: HTMLElement | null = null;
		let retryCurrent = () => undefined;
		let requestSequence = 0;
		let activeRequestId: string | null = null;
		let lastFingerprint: string | null = null;
		let selectors: Awaited<ReturnType<typeof loadSelectors>>["amazon_in"] | null = null;
		let mountFailureLogged = false;

		const makeContext = (
			productId: string | null,
			extractedPayload: ProductPayload | null = null,
		): ChipContext & { extractedPayload: ProductPayload | null } => ({
			platform: "amazon_in",
			productId,
			extractedPayload,
			pageUrl: location.href,
			errorCode: "UNKNOWN",
			selectorVersion: SELECTOR_VERSION,
		});
		const setState = (state: ChipState) => chip?.setState(state);
		const setError = (
			productId: string | null,
			errorCode: string,
			reason: string,
			payload: ProductPayload | null = null,
		) => {
			setState({
				status: "error",
				context: makeContext(productId, payload),
				errorCode,
				reason,
			});
		};

		const findAnchor = (): Element | null => {
			for (const selector of [PRIMARY_ANCHOR, ...FALLBACK_ANCHORS]) {
				try {
					const anchor = document.querySelector(selector);
					if (anchor) {
						return anchor;
					}
				} catch {
					continue;
				}
			}
			return null;
		};

		const waitForAnchor = (): Promise<Element | null> =>
			new Promise((resolve) => {
				const immediate = findAnchor();
				if (immediate) {
					resolve(immediate);
					return;
				}
				const root = document.documentElement;
				if (!root) {
					resolve(null);
					return;
				}
				const observer = new MutationObserver(() => {
					const anchor = findAnchor();
					if (anchor) {
						clearTimeout(timeout);
						observer.disconnect();
						resolve(anchor);
					}
				});
				const timeout = setTimeout(() => {
					observer.disconnect();
					resolve(findAnchor());
				}, ANCHOR_TIMEOUT_MS);
				observer.observe(root, { childList: true, subtree: true });
			});

		const anchor = await waitForAnchor();
		if (!anchor) {
			logger.chipMountFailed();
			mountFailureLogged = true;
			return;
		}

		let host = document.getElementById(CHIP_HOST_ID);
		if (!host) {
			host = document.createElement("div");
			host.id = CHIP_HOST_ID;
			host.dataset.daamUi = "true";
			host.style.cssText = "display:block;width:fit-content;margin:6px 0;";
			if (anchor.parentElement) {
				anchor.parentElement.insertBefore(host, anchor);
			} else {
				anchor.append(host);
			}
		}
		host.dataset.daamUi = "true";
		host.style.display = "block";
		chipHost = host;
		const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
		chip = new Chip(shadowRoot, { status: "loading", context: makeContext(null) }, () =>
			retryCurrent(),
		);

		const cancelPreviousRequest = (requestId: string | null) => {
			if (requestId) {
				void browser.runtime
					.sendMessage({
						type: "CANCEL_PRODUCT_INTELLIGENCE",
						requestId,
					})
					.catch(() => undefined);
			}
		};

		const runExtraction = async (force = false): Promise<void> => {
			if (!selectors) {
				return;
			}
			const inspection = await inspectAmazonPage(selectors);
			const fingerprint =
				inspection.status === "ready"
					? `${inspection.payload.productId}:${inspection.payload.sellerId}:${inspection.payload.dealPrice}:${inspection.payload.inStock}`
					: `${inspection.status}:${inspection.productId}:${inspection.errorCode}`;
			if (!force && fingerprint === lastFingerprint) {
				return;
			}

			cancelPreviousRequest(activeRequestId);
			const requestId = `${crypto.randomUUID()}-${++requestSequence}`;
			activeRequestId = requestId;
			lastFingerprint = fingerprint;
			const productId =
				inspection.status === "ready" ? inspection.payload.productId : inspection.productId;
			setState({
				status: "loading",
				context: makeContext(
					productId,
					inspection.status === "ready" ? inspection.payload : null,
				),
			});

			if (inspection.status === "unavailable") {
				setState({
					status: "unavailable",
					context: {
						...makeContext(inspection.productId),
						errorCode: inspection.errorCode,
					},
					reason: inspection.reason,
					errorCode: inspection.errorCode,
				});
				return;
			}

			const payload: ProductPayload = inspection.payload;
			try {
				const ingestion: unknown = await browser.runtime.sendMessage({
					type: "DAAM_PRODUCT_EXTRACTED",
					payload,
				});
				if (activeRequestId !== requestId) {
					return;
				}
				if (!isRecord(ingestion) || ingestion.success !== true) {
					const reason =
						isRecord(ingestion) && typeof ingestion.reason === "string"
							? ingestion.reason
							: "The product data could not be sent to Daam.";
					setError(payload.productId, "INGEST_FAILED", reason, payload);
					return;
				}

				const result: unknown = await browser.runtime.sendMessage({
					type: "FETCH_PRODUCT_INTELLIGENCE",
					platform: payload.platform,
					productId: payload.productId,
					requestId,
				});
				if (activeRequestId !== requestId) {
					return;
				}
				if (isProductIntelligenceResponse(result)) {
					const validPoints = result.history.filter(
						(point) =>
							Number.isFinite(point.effectivePrice) && point.effectivePrice > 0,
					);
					if (validPoints.length >= 2) {
						setState({
							status: "ready",
							context: makeContext(payload.productId, payload),
							payload,
							intelligence: result,
						});
					} else {
						setState({
							status: "tracking",
							context: makeContext(payload.productId, payload),
							payload,
						});
					}
					return;
				}
				if (result === null) {
					setState({
						status: "tracking",
						context: makeContext(payload.productId, payload),
						payload,
					});
					return;
				}
				const reason =
					isRecord(result) && typeof result.reason === "string"
						? result.reason
						: "Price history could not be fetched.";
				const errorCode =
					isRecord(result) && typeof result.errorCode === "string"
						? result.errorCode
						: "PRODUCT_FETCH_FAILED";
				setError(payload.productId, errorCode, reason, payload);
			} catch {
				if (activeRequestId === requestId) {
					setError(
						payload.productId,
						"EXTENSION_CONTEXT_INVALIDATED",
						"Daam could not complete the request. Reload the page and retry.",
						payload,
					);
				}
			}
		};

		retryCurrent = () => {
			void runExtraction(true);
		};

		try {
			selectors = (await loadSelectors()).amazon_in;
		} catch {
			selectors = null;
			setError(null, "SELECTORS_UNAVAILABLE", "Amazon selectors could not be loaded.");
			return;
		}

		void runExtraction(true);
		watchForChanges(() => {
			if (chipHost && !chipHost.isConnected) {
				void waitForAnchor().then((nextAnchor) => {
					if (!nextAnchor || !chipHost) {
						if (!mountFailureLogged) {
							logger.chipMountFailed();
							mountFailureLogged = true;
						}
						return;
					}
					if (nextAnchor.parentElement) {
						nextAnchor.parentElement.insertBefore(chipHost, nextAnchor);
					} else {
						nextAnchor.append(chipHost);
					}
					void runExtraction();
				});
				return;
			}
			void runExtraction();
		});
		window.addEventListener("popstate", () => void runExtraction(true));
		window.addEventListener("hashchange", () => void runExtraction(true));
		document.addEventListener("change", () => void runExtraction(true), true);
	},
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
