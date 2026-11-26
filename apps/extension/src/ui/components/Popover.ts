import type {
	ProductIntelligenceHistoryPoint,
	ProductIntelligenceResponse,
	ProductPayload,
} from "@daam/contracts";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { el } from "../primitives/dom";
import { DAAM_TOKENS } from "../primitives/tokens";
import { createReportButton, type ReportContext } from "./ReportButton";
import type { ChipState } from "./Chip";

const POPOVER_STYLES = `
	${DAAM_TOKENS}
	.daam-popover {
		position: fixed;
		z-index: 2147483647;
		width: min(320px, calc(100vw - 16px));
		max-height: min(420px, calc(100vh - 16px));
		overflow: auto;
		padding: 16px;
		border: 1px solid var(--daam-border);
		border-radius: var(--daam-radius);
		background: var(--daam-bg);
		color: var(--daam-fg);
		box-shadow: 0 8px 28px rgb(23 35 27 / 18%);
	}
	.daam-popover[hidden] { display: none; }
	.daam-popover h2 { margin: 0 0 12px; font-size: 14px; }
	.daam-tabs { display: flex; gap: 16px; margin: -4px 0 14px; border-bottom: 1px solid var(--daam-border); }
	.daam-tab { padding: 8px 0; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--daam-muted); font: inherit; cursor: pointer; }
	.daam-tab[aria-selected="true"] { border-bottom-color: var(--daam-positive); color: var(--daam-fg); font-weight: 700; }
	.daam-data-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 12px; }
	.daam-segmented { display: inline-flex; padding: 2px; border: 1px solid var(--daam-border); border-radius: 6px; }
	.daam-segment { padding: 4px 8px; border: 0; border-radius: 4px; background: transparent; color: var(--daam-muted); font: inherit; font-size: 11px; cursor: pointer; }
	.daam-segment[aria-pressed="true"] { background: #eaf3ed; color: var(--daam-positive); font-weight: 700; }
	.daam-copy { display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px; border: 1px solid var(--daam-border); border-radius: 6px; background: var(--daam-bg); color: var(--daam-fg); font: inherit; font-size: 11px; cursor: pointer; }
	.daam-copy:disabled { opacity: .5; cursor: default; }
	.daam-data-grid { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); border-top: 1px solid var(--daam-border); }
	.daam-data-row { display: contents; }
	.daam-data-key, .daam-data-value { min-width: 0; padding: 7px 6px; border-bottom: 1px solid var(--daam-border); font-size: 11px; }
	.daam-data-key { color: var(--daam-muted); }
	.daam-data-value { overflow-wrap: anywhere; font-weight: 600; }
	.daam-raw { max-width: 100%; max-height: 250px; overflow: auto; margin: 0; padding: 10px; border: 1px solid var(--daam-border); border-radius: 6px; background: #f6f8f6; color: var(--daam-fg); font: 11px/1.5 ui-monospace, monospace; white-space: pre; }
	.daam-muted { color: var(--daam-muted); }
	.daam-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
	.daam-metric { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
	.daam-metric span { color: var(--daam-muted); font-size: 11px; }
	.daam-metric strong { overflow-wrap: anywhere; font-size: 13px; }
	.daam-sparkline { display: block; width: 100%; height: 72px; margin: 12px 0; }
	.daam-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
	.daam-report, .daam-retry, .daam-layer-link {
		color: var(--daam-neutral); font: inherit; text-decoration: underline; cursor: pointer;
	}
	.daam-retry { padding: 6px 10px; border: 1px solid var(--daam-border); border-radius: 6px; background: transparent; }
	.daam-spinner {
		display: inline-block; width: 14px; height: 14px; margin-right: 7px;
		border: 2px solid var(--daam-border); border-top-color: var(--daam-neutral);
		border-radius: 50%; animation: daam-spin .8s linear infinite; vertical-align: -2px;
	}
	@keyframes daam-spin { to { transform: rotate(360deg); } }
`;

function formatPrice(value: number, currency: string): string {
	try {
		return new Intl.NumberFormat("en-IN", {
			style: "currency",
			currency,
			maximumFractionDigits: 0,
		}).format(value);
	} catch {
		return `${currency} ${Math.round(value)}`;
	}
}

type InspectorContext = ReportContext & { extractedPayload?: ProductPayload | null };

function extractedPayloadFor(state: ChipState): ProductPayload | null {
	if (state.status === "tracking" || state.status === "ready") {
		return state.payload;
	}
	const context = state.context as InspectorContext;
	return context.extractedPayload ?? null;
}

function formattedPayload(payload: ProductPayload): Array<[string, string]> {
	const display = (value: string | number | boolean | null | undefined): string => {
		if (value === null || value === undefined || value === "") {
			return "—";
		}
		return String(value);
	};
	const price = (value: number | null | undefined): string =>
		value === null || value === undefined ? "—" : formatPrice(value, payload.currency);
	const capturedAt = Number.isFinite(payload.timestamp)
		? new Date(payload.timestamp).toLocaleString()
		: "—";
	return [
		["ASIN", display(payload.productId)],
		["Title", display(payload.title)],
		["Brand", display(payload.brand)],
		["Category", display(payload.categoryPath?.join(" › "))],
		["Image URL", display(payload.imageUrl)],
		["Effective Price", price(payload.dealPrice)],
		["Buy Box", price(payload.buyBoxPrice ?? payload.dealPrice)],
		["MRP", price(payload.listPrice ?? payload.mrp)],
		["Coupon", price(payload.couponDiscount)],
		["Shipping", price(payload.shippingCost)],
		["Seller", display(payload.sellerName)],
		["Fulfillment", display(payload.fulfillmentType)],
		["Stock", payload.inStock ? "In stock" : "Out of stock"],
		["Lightning Deal", display(payload.isLightningDeal)],
		["BSR", display(payload.salesRank)],
		["Rating", payload.rating == null ? "—" : `${payload.rating} / 5`],
		["Reviews", display(payload.reviewCount)],
		["Offers", display(payload.newOfferCount)],
		["Lowest New Price", price(payload.lowestNewPrice)],
		["dHash", display(payload.imageHash)],
		["Captured At", capturedAt],
	];
}

function createCheckIcon(): SVGSVGElement {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 16 16");
	svg.setAttribute("width", "13");
	svg.setAttribute("height", "13");
	svg.setAttribute("aria-hidden", "true");
	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", "m3 8 3 3 7-7");
	path.setAttribute("fill", "none");
	path.setAttribute("stroke", "currentColor");
	path.setAttribute("stroke-width", "2");
	path.setAttribute("stroke-linecap", "round");
	path.setAttribute("stroke-linejoin", "round");
	svg.append(path);
	return svg;
}

function createSparkline(history: ProductIntelligenceHistoryPoint[]): SVGSVGElement {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 288 72");
	svg.setAttribute("role", "img");
	svg.setAttribute("aria-label", "90-day price trend");
	const prices = history.map((point) => point.effectivePrice);
	const minimum = Math.min(...prices);
	const maximum = Math.max(...prices);
	const range = maximum - minimum || 1;
	const coordinates = prices.map((price, index) => ({
		x: 4 + (index / Math.max(1, prices.length - 1)) * 280,
		y: 8 + ((maximum - price) / range) * 52,
	}));
	const linePath = coordinates
		.map(
			(point, index) =>
				`${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
		)
		.join(" ");
	const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
	line.setAttribute("d", linePath);
	line.setAttribute("fill", "none");
	line.setAttribute("stroke", "#187047");
	line.setAttribute("stroke-width", "2.5");
	line.setAttribute("stroke-linecap", "round");
	line.setAttribute("stroke-linejoin", "round");
	svg.append(line);
	return svg;
}

function renderHistoryView(
	intelligence: ProductIntelligenceResponse,
	currency: string,
	reportContext: ReportContext,
): HTMLElement {
	const heading = el("h2", { textContent: "Price history" });
	const metrics = el("div", { className: "daam-metrics" });
	const values = [
		["Current", intelligence.stats.currentPrice],
		["90d Min", intelligence.stats.minPrice],
		["90d Max", intelligence.stats.maxPrice],
		["90d Median", intelligence.stats.medianPrice],
	] as const;
	for (const [label, value] of values) {
		metrics.append(
			el(
				"div",
				{ className: "daam-metric" },
				el("span", { textContent: label }),
				el("strong", { textContent: formatPrice(value, currency) }),
			),
		);
	}
	const detail = el("p", {
		className: "daam-muted",
		textContent: `${intelligence.stats.dataPoints} recorded price point${intelligence.stats.dataPoints === 1 ? "" : "s"}`,
	});
	const actions = el(
		"div",
		{ className: "daam-actions" },
		el("a", {
			className: "daam-layer-link",
			href: "https://github.com/ZNAXNOR/Daam",
			target: "_blank",
			rel: "noopener noreferrer",
			textContent: "Layer 3 · Daam project",
		}),
		createReportButton({ ...reportContext, errorCode: "PRICE_HISTORY_FEEDBACK" }),
	);
	return el(
		"section",
		null,
		heading,
		createSparkline(intelligence.history),
		metrics,
		detail,
		actions,
	);
}

function renderEmptyView(
	state: Extract<ChipState, { status: "loading" | "tracking" | "unavailable" }>,
): HTMLElement {
	if (state.status === "loading") {
		return el(
			"section",
			null,
			el("h2", { textContent: "Price history" }),
			el(
				"p",
				{ className: "daam-muted" },
				el("span", { className: "daam-spinner", "aria-hidden": "true" }),
				"Checking price history...",
			),
			createReportButton({ ...state.context, errorCode: "PRICE_HISTORY_LOADING" }),
		);
	}
	if (state.status === "tracking") {
		return el(
			"section",
			null,
			el("h2", { textContent: "Tracking started" }),
			el("strong", {
				textContent: formatPrice(state.payload.dealPrice, state.payload.currency),
			}),
			el("p", { className: "daam-muted", textContent: "First time seen. Check back soon." }),
			createReportButton({ ...state.context, errorCode: "TRACKING_FEEDBACK" }),
		);
	}
	return el(
		"section",
		null,
		el("h2", { textContent: "Price unavailable" }),
		el("p", { className: "daam-muted", textContent: state.reason }),
		createReportButton({ ...state.context, errorCode: state.errorCode }),
	);
}

function renderErrorView(
	state: Extract<ChipState, { status: "error" }>,
	onRetry: () => void,
): HTMLElement {
	const retry = el("button", {
		className: "daam-retry",
		type: "button",
		textContent: "Retry",
		onClick: onRetry,
	});
	return el(
		"section",
		null,
		el("h2", { textContent: "Data fetch failed" }),
		el("p", { className: "daam-muted", textContent: state.reason }),
		el(
			"div",
			{ className: "daam-actions" },
			retry,
			createReportButton({ ...state.context, errorCode: state.errorCode }),
		),
	);
}

export class Popover {
	readonly element = el("div", {
		className: "daam-popover",
		role: "dialog",
		"aria-label": "Daam price details",
		hidden: true,
	});
	private currentState: ChipState;
	private isOpen = false;
	private activeView: "overview" | "data" = "overview";
	private rawMode = false;
	private stopAutoUpdate: (() => void) | null = null;
	private positionRequest = 0;

	constructor(
		private readonly shadowRoot: ShadowRoot,
		private readonly host: HTMLElement,
		private readonly anchor: HTMLElement,
		private readonly onRetry: () => void,
		private readonly onOpenChange: (open: boolean) => void,
		initialState: ChipState,
	) {
		const styles = el("style", { textContent: POPOVER_STYLES });
		this.shadowRoot.append(styles, this.element);
		this.currentState = initialState;
		this.render();
		document.addEventListener("keydown", this.onKeyDown);
	}

	setState(state: ChipState): void {
		this.currentState = state;
		this.render();
		if (this.isOpen) {
			void this.position();
		}
	}

	toggle(): void {
		this.isOpen = !this.isOpen;
		this.element.hidden = !this.isOpen;
		this.onOpenChange(this.isOpen);
		if (this.isOpen) {
			this.render();
			this.stopAutoUpdate?.();
			this.stopAutoUpdate = autoUpdate(this.anchor, this.element, () => {
				void this.position();
			});
			void this.position();
			document.addEventListener("pointerdown", this.onOutsideClick, true);
		} else {
			this.stopAutoUpdate?.();
			this.stopAutoUpdate = null;
			this.positionRequest += 1;
			document.removeEventListener("pointerdown", this.onOutsideClick, true);
		}
	}

	destroy(): void {
		this.stopAutoUpdate?.();
		this.stopAutoUpdate = null;
		this.positionRequest += 1;
		document.removeEventListener("keydown", this.onKeyDown);
		document.removeEventListener("pointerdown", this.onOutsideClick, true);
	}

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape" && this.isOpen) {
			this.toggle();
		}
	};

	private readonly onOutsideClick = (event: PointerEvent): void => {
		if (event.target instanceof Node && !this.host.contains(event.target)) {
			this.toggle();
		}
	};

	private async position(): Promise<void> {
		const request = ++this.positionRequest;
		let result: Awaited<ReturnType<typeof computePosition>>;
		try {
			result = await computePosition(this.anchor, this.element, {
				strategy: "fixed",
				placement: "bottom-start",
				middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
			});
		} catch {
			return;
		}
		if (!this.isOpen || request !== this.positionRequest) {
			return;
		}
		this.element.style.left = `${result.x}px`;
		this.element.style.top = `${result.y}px`;
	}

	private render(): void {
		const tabs = el("div", { className: "daam-tabs", role: "tablist" });
		for (const [view, label] of [
			["overview", "Overview"],
			["data", "Data"],
		] as const) {
			tabs.append(
				el("button", {
					className: "daam-tab",
					type: "button",
					role: "tab",
					"aria-selected": String(this.activeView === view),
					textContent: label,
					onClick: () => {
						this.activeView = view;
						this.render();
					},
				}),
			);
		}
		this.element.replaceChildren(
			tabs,
			this.activeView === "overview" ? this.renderOverview() : this.renderData(),
		);
	}

	private renderOverview(): HTMLElement {
		let view: HTMLElement;
		if (this.currentState.status === "ready") {
			view = renderHistoryView(
				this.currentState.intelligence,
				this.currentState.payload.currency,
				this.currentState.context,
			);
		} else if (this.currentState.status === "error") {
			view = renderErrorView(this.currentState, this.onRetry);
		} else {
			view = renderEmptyView(this.currentState);
		}
		return view;
	}

	private renderData(): HTMLElement {
		const payload = extractedPayloadFor(this.currentState);
		const formattedButton = el("button", {
			className: "daam-segment",
			type: "button",
			"aria-pressed": String(!this.rawMode),
			textContent: "Formatted",
			onClick: () => {
				this.rawMode = false;
				this.render();
			},
		});
		const rawButton = el("button", {
			className: "daam-segment",
			type: "button",
			"aria-pressed": String(this.rawMode),
			textContent: "Raw",
			onClick: () => {
				this.rawMode = true;
				this.render();
			},
		});
		const segmented = el(
			"div",
			{ className: "daam-segmented", role: "group", "aria-label": "Data format" },
			formattedButton,
			rawButton,
		);
		const copyButton = el("button", {
			className: "daam-copy",
			type: "button",
			textContent: "Copy",
		});
		copyButton.disabled = payload === null;
		copyButton.addEventListener("click", async () => {
			if (!payload) {
				return;
			}
			try {
				await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
				copyButton.replaceChildren(createCheckIcon(), document.createTextNode("Copied"));
				setTimeout(() => {
					if (copyButton.isConnected) {
						copyButton.textContent = "Copy";
					}
				}, 1_500);
			} catch {
				copyButton.textContent = "Copy unavailable";
			}
		});
		const toolbar = el("div", { className: "daam-data-toolbar" }, segmented, copyButton);

		let dataView: HTMLElement;
		if (!payload) {
			dataView = el("p", {
				className: "daam-muted",
				textContent: "No extracted product data is available yet.",
			});
		} else if (this.rawMode) {
			dataView = el("pre", {
				className: "daam-raw",
				textContent: JSON.stringify(payload, null, 2),
			});
		} else {
			const grid = el("div", { className: "daam-data-grid" });
			for (const [label, value] of formattedPayload(payload)) {
				grid.append(
					el(
						"div",
						{ className: "daam-data-row" },
						el("div", { className: "daam-data-key", textContent: label }),
						el("div", { className: "daam-data-value", textContent: value }),
					),
				);
			}
			dataView = grid;
		}
		return el("section", null, toolbar, dataView);
	}
}
