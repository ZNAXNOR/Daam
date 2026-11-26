import type { ProductIntelligenceHistoryPoint, ProductIntelligenceResponse } from "@daam/contracts";
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
			this.position();
		}
	}

	toggle(): void {
		this.isOpen = !this.isOpen;
		this.element.hidden = !this.isOpen;
		this.onOpenChange(this.isOpen);
		if (this.isOpen) {
			this.render();
			this.position();
			document.addEventListener("pointerdown", this.onOutsideClick, true);
		} else {
			document.removeEventListener("pointerdown", this.onOutsideClick, true);
		}
	}

	destroy(): void {
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

	private position(): void {
		const anchorRect = this.anchor.getBoundingClientRect();
		const popoverRect = this.element.getBoundingClientRect();
		const width = popoverRect.width || 320;
		const height = popoverRect.height || 180;
		const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - width - 8));
		const below = anchorRect.bottom + 8;
		const top =
			below + height > window.innerHeight - 8
				? Math.max(8, anchorRect.top - height - 8)
				: below;
		this.element.style.left = `${left}px`;
		this.element.style.top = `${top}px`;
	}

	private render(): void {
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
		this.element.replaceChildren(view);
	}
}
