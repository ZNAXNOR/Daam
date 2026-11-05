import "../assets/tailwind.css";
import { extractAmazonData, type ProductPayload } from "../src/extractors/amazon";
import { createAssistChip, type AssistChipView } from "../src/ui/AssistChip";
import { watchForChanges } from "../src/utils/observer";

let lastSeen: { asin: string | null; sellerId: string | null } = {
	asin: null,
	sellerId: null,
};

export default defineContentScript({
	matches: [
		"*://*.amazon.in/dp/*",
		"*://*.amazon.in/*/dp/*",
	],
	cssInjectionMode: "ui",

	async main(ctx) {
		console.info("[Daam] content script started", {
			url: location.href,
			customElements: typeof customElements !== "undefined",
		});
		try {
			await import("@material/web/chips/assist-chip.js");
			console.info("[Daam] md-assist-chip registered", {
				registered: Boolean(customElements.get("md-assist-chip")),
			});
		} catch (error) {
			console.warn("[Daam] md-assist-chip registration failed; using fallback button", error);
		}

		let chipView: AssistChipView | null = null;
		let chipUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
		let renderedState: string | null = null;
		let extractionInProgress = false;

		const mountChip = async (state: "success" | "error", data?: ProductPayload) => {
			console.info("[Daam] mount requested", { state, productId: data?.productId });
			if (chipView && !chipView.root.isConnected) {
				console.warn("[Daam] previous chip was detached; remounting");
				chipView = null;
				chipUi = null;
				renderedState = null;
			}

			const nextState = state === "success"
				? `${state}:${data?.productId}:${data?.sellerId}:${data?.dealPrice}`
				: state;
			if (nextState === renderedState) {
				return;
			}

			renderedState = nextState;
			if (chipView) {
				const nextView = createAssistChip(state, data);
				chipView.root.replaceWith(nextView.root);
				chipView = nextView;
				return;
			}

			const anchor = document.querySelector("#corePriceDisplay_desktop_feature_div")
				?? document.querySelector("#centerCol")
				?? document.body;
			console.info("[Daam] UI anchor selected", {
				id: anchor.id || null,
				tag: anchor.tagName,
				isBody: anchor === document.body,
			});

			try {
				chipUi = await createShadowRootUi(ctx, {
					name: "daam-assist-chip",
					position: "inline",
					anchor,
					append: "before",
					onMount(container) {
						const host = container.parentElement;
						if (host) {
							host.dataset.daamUi = "true";
							host.style.display = "block";
						}
						try {
							chipView = createAssistChip(state, data);
							container.replaceChildren(chipView.root);
							console.info("[Daam] UI mounted", {
								hostConnected: Boolean(host?.isConnected),
								chipConnected: chipView.root.isConnected,
								shadowChildren: container.childElementCount,
								chipTag: chipView.chip.tagName,
								materialRegistered: Boolean(customElements.get("md-assist-chip")),
							});
						} catch (error) {
							console.error("[Daam] UI render callback failed", error);
							const fallbackRoot = document.createElement("div");
							fallbackRoot.dataset.daamChip = "true";
							fallbackRoot.style.cssText = "display:block;width:fit-content;";
							const fallbackStyles = document.createElement("style");
							fallbackStyles.textContent =
								".daam-fallback-card{width:420px;max-width:calc(100vw - 24px);box-sizing:border-box}" +
								".daam-fallback-scroll{padding-right:10px;max-height:192px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#747878 #e8e8e6}" +
								".daam-fallback-scroll::-webkit-scrollbar{width:8px}" +
								".daam-fallback-scroll::-webkit-scrollbar-track{background:#e8e8e6;border-radius:999px}" +
								".daam-fallback-scroll::-webkit-scrollbar-thumb{background:#747878;border:2px solid #e8e8e6;border-radius:999px}" +
								"@media(max-width:640px){.daam-fallback-card{position:fixed;top:12px;left:12px;width:calc(100vw - 24px);max-width:none;max-height:calc(100vh - 24px);overflow-y:auto;z-index:2147483647}}";
							fallbackRoot.append(fallbackStyles);
							const fallback = document.createElement("button");
							fallback.type = "button";
							fallback.textContent = state === "success"
								? `🟢 Daam: ₹${data?.dealPrice.toLocaleString("en-IN") ?? "Price found"}`
								: "⚠️ Daam: Page unreadable";
							fallback.style.cssText =
								"display:block!important;visibility:visible!important;opacity:1!important;" +
								"padding:8px 16px;border:1px solid #747878;border-radius:999px;" +
								"background:#e3dfff;color:#1a1c1b;font:14px sans-serif;cursor:pointer;";
							const fallbackCard = document.createElement("div");
							fallbackCard.hidden = true;
							fallbackCard.className = "daam-fallback-card";
							fallbackCard.style.cssText =
								"display:block;padding:16px;margin:8px 0 0;border-radius:16px;" +
								"background:#eeeeec;color:#1a1c1b;font:12px/1.5 sans-serif;";
							if (data) {
								const heading = document.createElement("strong");
								heading.textContent = "Daam extracted data";
								heading.style.display = "block";
								heading.style.marginBottom = "8px";
								fallbackCard.append(heading);

								const rows = document.createElement("div");
								rows.className = "daam-fallback-scroll";
								for (const [key, value] of Object.entries(data)) {
									const row = document.createElement("div");
									row.style.cssText =
										"display:flex;justify-content:space-between;gap:12px;" +
										"padding:4px 0;border-bottom:1px solid #e8e8e6;";
									const keyElement = document.createElement("span");
									keyElement.textContent = key;
									keyElement.style.color = "#444748";
									const valueElement = document.createElement("span");
									valueElement.textContent = value === null ? "—" : String(value);
									valueElement.style.cssText =
										"font-weight:500;text-align:right;overflow-wrap:anywhere;";
									row.append(keyElement, valueElement);
									rows.append(row);
								}
								fallbackCard.append(rows);
								const copyButton = document.createElement("button");
								copyButton.type = "button";
								copyButton.style.cssText =
									"display:flex;align-items:center;justify-content:center;gap:8px;width:100%;" +
									"margin-top:16px;padding:8px;border:0;border-radius:999px;" +
									"background:#e8e8e6;color:#1a1c1b;font:500 14px sans-serif;cursor:pointer;";
								copyButton.innerHTML =
									'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Copy Data</span>';
								copyButton.addEventListener("click", async () => {
									try {
										await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
										const label = copyButton.querySelector("span");
										if (label) {
											label.textContent = "Copied!";
											setTimeout(() => {
												label.textContent = "Copy Data";
											}, 2000);
										}
									} catch (error) {
										console.error("[Daam] fallback copy failed", error);
									}
								});
								fallbackCard.append(copyButton);
							} else {
								fallbackCard.textContent = "Please report this unreadable Amazon product page.";
							}
							fallback.addEventListener("click", () => {
								if (state === "error") {
									window.open("https://github.com/ZNAXNOR/Daam/issues/new", "_blank", "noopener,noreferrer");
									return;
								}
								fallbackCard.hidden = !fallbackCard.hidden;
							});
							fallbackRoot.append(fallback, fallbackCard);
							chipView = { root: fallbackRoot, chip: fallback };
							container.replaceChildren(fallbackRoot);
							console.warn("[Daam] visible fallback inserted", {
								shadowChildren: container.childElementCount,
								hasCard: true,
							});
						}
					},
				});
				chipUi.mount();
				if (chipUi.uiContainer.childElementCount === 0) {
					console.warn("[Daam] WXT mount produced an empty UI container; inserting chip directly");
					chipView = createAssistChip(state, data);
					chipUi.uiContainer.replaceChildren(chipView.root);
				}
				console.info("[Daam] UI mount call completed", {
					hostConnected: chipUi.shadowHost.isConnected,
					containerChildren: chipUi.uiContainer.childElementCount,
				});
			} catch (error) {
				console.error("[Daam] UI mount failed", error);
			}
		};

		const runExtraction = async () => {
			if (extractionInProgress) {
				return;
			}
			extractionInProgress = true;
			try {
				const payload = await extractAmazonData();
				console.info("[Daam] extraction result", payload ? {
					productId: payload.productId,
					dealPrice: payload.dealPrice,
					sellerId: payload.sellerId,
				} : null);
				if (!payload || !payload.dealPrice || !payload.productId) {
					console.warn("[Daam] extraction returned no usable payload");
					await mountChip("error");
					return;
				}

				if (payload.productId !== lastSeen.asin) {
					console.log("🔄 Variant Detected: ", payload.productId);
				} else if (payload.sellerId !== lastSeen.sellerId) {
					console.log("🏪 Seller Switched: ", lastSeen.sellerId, "->", payload.sellerId);
				}

				const stateKey = `success:${payload.productId}:${payload.sellerId}:${payload.dealPrice}`;
				if (stateKey !== renderedState) {
					lastSeen = { asin: payload.productId, sellerId: payload.sellerId };
					await browser.runtime.sendMessage({ type: "DAAM_PRODUCT_EXTRACTED", payload });
					await mountChip("success", payload);
				}
			} catch (error) {
				console.error("[Daam] extraction or rendering failed", error);
				await mountChip("error");
			} finally {
				extractionInProgress = false;
			}
		};

		await runExtraction();
		console.info("[Daam] initial extraction completed");
		watchForChanges(() => {
			console.info("[Daam] DOM change debounce fired");
			void runExtraction();
		});
	},
});
