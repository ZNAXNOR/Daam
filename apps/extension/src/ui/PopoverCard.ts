interface PopoverCardData {
	current: number;
	lowest: number;
	avg: number;
}

function formatPrice(value: number): string {
	return new Intl.NumberFormat("en-IN", {
		style: "currency",
		currency: "INR",
		maximumFractionDigits: 0,
	}).format(value);
}

function createSparkline(): SVGSVGElement {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 288 72");
	svg.setAttribute("fill", "none");
	svg.setAttribute("aria-label", "90-day price trend");
	svg.classList.add("mt-4", "h-16", "w-full");

	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", "M4 54C20 48 24 24 42 32s24 24 40 14 24-32 40-20 24 28 40 14 24-26 40-16 24 18 42-12");
	path.setAttribute("stroke", "#5a5799");
	path.setAttribute("stroke-width", "3");
	path.setAttribute("stroke-linecap", "round");
	path.setAttribute("stroke-linejoin", "round");
	svg.append(path);

	return svg;
}

export function createPopoverCard(data: PopoverCardData): HTMLDivElement {
	const card = document.createElement("div");
	card.className =
		"absolute hidden w-[320px] rounded-[18px] bg-surface-container-lowest p-4 shadow-lg";

	const header = document.createElement("h2");
	header.className = "text-base font-semibold text-on-surface";
	header.textContent = "Daam Price Intel";

	const metrics = document.createElement("div");
	metrics.className = "mt-4 grid grid-cols-3 gap-3";

	for (const metric of [
		["Current", data.current],
		["90d Avg", data.avg],
		["Lowest", data.lowest],
	] as const) {
		const item = document.createElement("div");
		item.className = "flex min-w-0 flex-col gap-1";

		const label = document.createElement("span");
		label.className = "text-xs text-on-surface-variant";
		label.textContent = metric[0];

		const value = document.createElement("strong");
		value.className = "text-sm font-bold text-on-surface";
		value.textContent = formatPrice(metric[1]);

		item.append(label, value);
		metrics.append(item);
	}

	card.append(header, metrics, createSparkline());
	return card;
}
