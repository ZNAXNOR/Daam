import type {
	ProductIntelligenceResponse,
	ProductPayload,
	ProductVerdictTone,
	StorePlatform,
} from "@daam/contracts";
import { el } from "../primitives/dom";
import { DAAM_TOKENS } from "../primitives/tokens";
import { Popover } from "./Popover";
import type { ReportContext } from "./ReportButton";

export type ChipContext = ReportContext & { platform: StorePlatform };

export type ChipState =
	| { status: "loading"; context: ChipContext }
	| { status: "tracking"; context: ChipContext; payload: ProductPayload }
	| {
			status: "ready";
			context: ChipContext;
			payload: ProductPayload;
			intelligence: ProductIntelligenceResponse;
	  }
	| { status: "error"; context: ChipContext; reason: string; errorCode: string }
	| { status: "unavailable"; context: ChipContext; reason: string; errorCode: string };

const CHIP_STYLES = `
	${DAAM_TOKENS}
	.daam-chip {
		display: inline-flex; min-height: 38px; max-width: min(280px, calc(100vw - 16px));
		align-items: center; gap: 9px; padding: 5px 12px; border: 1px solid var(--daam-border);
		border-radius: var(--daam-radius); background: var(--daam-bg); color: var(--daam-fg);
		font: inherit; text-align: left; cursor: pointer; box-shadow: 0 1px 3px rgb(23 35 27 / 10%);
	}
	.daam-chip:hover { border-color: var(--daam-neutral); }
	.daam-chip:focus-visible { outline: 2px solid var(--daam-neutral); outline-offset: 2px; }
	.daam-chip-copy { display: flex; min-width: 0; flex-direction: column; line-height: 1.15; }
	.daam-chip-title { overflow: hidden; max-width: 230px; font-size: 12px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
	.daam-chip-subtitle { overflow: hidden; max-width: 230px; margin-top: 3px; color: var(--daam-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
	.daam-status { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: var(--daam-neutral); }
	.daam-status[data-tone="positive"] { background: var(--daam-positive); }
	.daam-status[data-tone="warning"] { background: var(--daam-warning); }
	.daam-status[data-tone="negative"] { background: var(--daam-negative); }
	.daam-status[data-loading="true"] { animation: daam-pulse 1.2s ease-in-out infinite; }
	@keyframes daam-pulse { 50% { opacity: .35; } }
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

function getDisplay(state: ChipState): {
	title: string;
	subtitle: string;
	tone: ProductVerdictTone;
} {
	switch (state.status) {
		case "loading":
			return { title: "No data", subtitle: "Collecting data", tone: "neutral" };
		case "tracking":
			return { title: "Tracking", subtitle: "1st price logged", tone: "neutral" };
		case "ready":
			return {
				title: state.intelligence.verdict.label,
				subtitle: formatPrice(
					state.intelligence.stats.currentPrice,
					state.payload.currency,
				),
				tone: state.intelligence.verdict.tone,
			};
		case "error":
			return { title: "No data", subtitle: "Data fetch failed", tone: "negative" };
		case "unavailable":
			return { title: "No data", subtitle: "Price unavailable", tone: "warning" };
	}
}

export class Chip {
	private readonly button = el("button", {
		className: "daam-chip",
		type: "button",
		"aria-expanded": "false",
		"aria-haspopup": "dialog",
	});
	private readonly statusDot = el("span", { className: "daam-status", "aria-hidden": "true" });
	private readonly title = el("strong", { className: "daam-chip-title" });
	private readonly subtitle = el("span", { className: "daam-chip-subtitle" });
	private readonly popover: Popover;

	constructor(
		private readonly shadowRoot: ShadowRoot,
		initialState: ChipState,
		onRetry: () => void,
	) {
		const styles = el("style", { textContent: CHIP_STYLES });
		const copy = el("span", { className: "daam-chip-copy" }, this.title, this.subtitle);
		this.button.append(this.statusDot, copy);
		this.shadowRoot.replaceChildren(styles, this.button);
		this.popover = new Popover(
			this.shadowRoot,
			this.shadowRoot.host as HTMLElement,
			this.button,
			onRetry,
			(open) => this.button.setAttribute("aria-expanded", String(open)),
			initialState,
		);
		this.button.addEventListener("click", () => {
			this.popover.toggle();
		});
		this.setState(initialState);
	}

	setState(state: ChipState): void {
		const display = getDisplay(state);
		this.title.textContent = display.title;
		this.subtitle.textContent = display.subtitle;
		this.statusDot.dataset.tone = display.tone;
		this.statusDot.dataset.loading = String(state.status === "loading");
		this.button.setAttribute("aria-label", `${display.title}. ${display.subtitle}`);
		this.popover.setState(state);
	}

	destroy(): void {
		this.popover.destroy();
	}
}
