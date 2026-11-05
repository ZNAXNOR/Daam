import type { ProductPayload } from "../extractors/amazon";

export interface AssistChipView {
	root: HTMLDivElement;
	chip: HTMLElement;
}

export function createAssistChip(
	state: "success" | "error",
	data?: ProductPayload,
): AssistChipView {
	const root = document.createElement("div");
	root.dataset.daamChip = "true";
	root.style.display = "block";
	root.style.marginBottom = "8px";
	const styles = document.createElement("style");
	styles.textContent = `
		.daam-popover {
			width: 420px;
			max-width: min(420px, calc(100vw - 24px));
			box-sizing: border-box;
		}
		.daam-data-grid {
			padding-right: 10px;
			scrollbar-width: thin;
			scrollbar-color: #747878 #e8e8e6;
		}
		.daam-data-grid::-webkit-scrollbar {
			width: 8px;
		}
		.daam-data-grid::-webkit-scrollbar-track {
			background: #e8e8e6;
			border-radius: 999px;
		}
		.daam-data-grid::-webkit-scrollbar-thumb {
			background: #747878;
			border: 2px solid #e8e8e6;
			border-radius: 999px;
		}
		.daam-data-grid::-webkit-scrollbar-thumb:hover {
			background: #444748;
		}
		@media (max-width: 640px) {
			.daam-popover {
				position: fixed;
				top: 12px;
				left: 12px;
				width: calc(100vw - 24px);
				max-width: none;
				max-height: calc(100vh - 24px);
				overflow-y: auto;
				z-index: 2147483647;
			}
		}
	`;
	root.append(styles);

	const chip = document.createElement(
		customElements.get("md-assist-chip") ? "md-assist-chip" : "button",
	);
	if (chip instanceof HTMLButtonElement) {
		chip.type = "button";
		chip.style.padding = "8px 16px";
		chip.style.borderRadius = "999px";
		chip.style.border = "1px solid #747878";
		chip.style.background = "#e3dfff";
		chip.style.color = "#1a1c1b";
		chip.style.cursor = "pointer";
	}
	chip.setAttribute(
		"label",
		state === "success"
			? `🟢 Daam: ₹${data?.dealPrice.toLocaleString("en-IN") ?? "Price found"}`
			: "⚠️ Daam: Page unreadable (Report Issue)",
	);
	if (chip instanceof HTMLButtonElement) {
		chip.textContent = chip.getAttribute("label");
	}
	chip.dataset.daamChip = "true";
	chip.setAttribute("aria-expanded", "false");

	const popover = document.createElement("div");
	popover.hidden = true;
	popover.className = "daam-popover mt-2 rounded-2xl bg-surface-container p-4 text-on-surface";

	if (state === "success" && data) {
		const tabs = document.createElement("div");
		tabs.className = "flex border-b border-outline-variant";

		const trendTab = document.createElement("button");
		trendTab.type = "button";
		trendTab.textContent = "Price Trend";
		trendTab.className =
			"border-b-2 border-primary px-3 py-2 font-semibold text-primary";

		const dataTab = document.createElement("button");
		dataTab.type = "button";
		dataTab.textContent = "Extracted Data";
		dataTab.className = "px-3 py-2 text-on-surface-variant";
		tabs.append(trendTab, dataTab);

		const trendContent = document.createElement("div");
		trendContent.className =
			"h-32 flex items-center justify-center text-sm text-on-surface-variant";
		trendContent.textContent = "Graph Placeholder";

		const dataContent = document.createElement("div");
		dataContent.className = "hidden";

		const dataGrid = document.createElement("div");
		dataGrid.className = "daam-data-grid mt-2 max-h-48 overflow-y-auto text-xs text-on-surface";
		for (const [key, value] of Object.entries(data)) {
			const row = document.createElement("div");
			row.className =
				"flex justify-between border-b border-surface-container-high py-1";

			const keyElement = document.createElement("span");
			keyElement.className = "capitalize text-on-surface-variant";
			keyElement.textContent = key;

			const valueElement = document.createElement("span");
			valueElement.className = "max-w-[60%] break-words text-right font-medium";
			valueElement.textContent = value === null ? "—" : String(value);

			row.append(keyElement, valueElement);
			dataGrid.append(row);
		}

		const copyButton = document.createElement("button");
		copyButton.type = "button";
		copyButton.className =
			"mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-surface-container-high py-2 text-sm font-medium transition-colors hover:bg-surface-container";
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
				console.error("[Daam] failed to copy extracted data", error);
			}
		});

		dataContent.append(dataGrid, copyButton);
		popover.append(tabs, trendContent, dataContent);

		const activateTab = (active: HTMLButtonElement, inactive: HTMLButtonElement) => {
			active.className = "border-b-2 border-primary px-3 py-2 text-sm font-semibold text-primary";
			inactive.className = "px-3 py-2 text-sm text-on-surface-variant";
		};
		trendTab.addEventListener("click", () => {
			trendContent.classList.remove("hidden");
			dataContent.classList.add("hidden");
			activateTab(trendTab, dataTab);
		});
		dataTab.addEventListener("click", () => {
			trendContent.classList.add("hidden");
			dataContent.classList.remove("hidden");
			activateTab(dataTab, trendTab);
		});
	} else {
		const message = document.createElement("div");
		message.className = "text-sm text-on-surface-variant";
		message.textContent = "Please report this unreadable Amazon product page.";
		popover.append(message);
	}

	const toggleCard = () => {
		popover.hidden = !popover.hidden;
		popover.style.display = popover.hidden ? "none" : "block";
		chip.setAttribute("aria-expanded", String(!popover.hidden));
	};

	chip.addEventListener("click", () => {
		if (state === "error") {
			window.open("https://github.com/ZNAXNOR/Daam/issues/new", "_blank", "noopener,noreferrer");
			return;
		}
		toggleCard();
	});

	root.append(chip, popover);
	return { root, chip };
}
