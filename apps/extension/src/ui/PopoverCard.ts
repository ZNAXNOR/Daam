import type {
	ProductIntelligenceHistoryPoint,
	ProductIntelligenceResponse,
} from "@daam/contracts";

function formatPrice(value: number, currency: string): string {
	return new Intl.NumberFormat("en-IN", {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	}).format(value);
}

function createSparkline(
	history: ProductIntelligenceHistoryPoint[],
): SVGSVGElement {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 288 72");
	svg.setAttribute("role", "img");
	svg.setAttribute("aria-label", "90-day price trend");
	svg.classList.add("mt-3", "h-16", "w-full");

	const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
	title.textContent = "Price history over the last 90 days";
	svg.append(title);

	const prices = history.map((point) => point.effectivePrice);
	const minPrice = prices.reduce((minimum, price) => Math.min(minimum, price), Infinity);
	const maxPrice = prices.reduce((maximum, price) => Math.max(maximum, price), -Infinity);
	const range = maxPrice - minPrice || 1;
	const coordinates = prices.map((price, index) => ({
		x: 4 + (index / (prices.length - 1)) * 280,
		y: 8 + ((maxPrice - price) / range) * 52,
	}));
	const first = coordinates[0];
	const current = coordinates[coordinates.length - 1];
	if (!first || !current) {
		return svg;
	}

	const linePath = coordinates
		.map((point, index) =>
			`${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
		)
		.join(" ");
	const areaPath =
		`${linePath} L ${current.x} 64 L ${first.x} 64 Z`;

	const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
	area.setAttribute("d", areaPath);
	area.setAttribute("fill", "#5a5799");
	area.setAttribute("fill-opacity", "0.12");

	const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
	line.setAttribute("d", linePath);
	line.setAttribute("fill", "none");
	line.setAttribute("stroke", "#5a5799");
	line.setAttribute("stroke-width", "2.5");
	line.setAttribute("stroke-linecap", "round");
	line.setAttribute("stroke-linejoin", "round");

	const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
	marker.setAttribute("cx", current.x.toFixed(2));
	marker.setAttribute("cy", current.y.toFixed(2));
	marker.setAttribute("r", "4");
	marker.setAttribute("fill", "#5a5799");
	marker.setAttribute("stroke", "#ffffff");
	marker.setAttribute("stroke-width", "2");

	svg.append(area, line, marker);
	return svg;
}

export function createPopoverCard(
	intelligence: ProductIntelligenceResponse | null,
	extractedPrice: number,
	currency: string,
): HTMLDivElement {
	const card = document.createElement("div");
	card.className = "rounded-xl bg-surface-container-lowest";

	const header = document.createElement("h2");
	header.className = "text-sm font-semibold text-on-surface";
	header.textContent = "Price history";

	const metrics = document.createElement("div");
	metrics.className = "mt-3 grid grid-cols-2 gap-3";

	const statValues = intelligence?.stats;
	const metricValues = [
		["Current", statValues?.currentPrice ?? extractedPrice],
		["90d Min", statValues?.minPrice],
		["90d Max", statValues?.maxPrice],
		["90d Median", statValues?.medianPrice],
	] as const;

	for (const [labelText, price] of metricValues) {
		const item = document.createElement("div");
		item.className = "flex min-w-0 flex-col gap-1";

		const label = document.createElement("span");
		label.className = "text-xs text-on-surface-variant";
		label.textContent = labelText;

		const value = document.createElement("strong");
		value.className = "text-sm font-bold text-on-surface";
		value.textContent = price === undefined ? "—" : formatPrice(price, currency);

		item.append(label, value);
		metrics.append(item);
	}

	const detail = document.createElement("p");
	detail.className = "mt-2 text-xs text-on-surface-variant";
	detail.textContent = statValues
		? `${statValues.dataPoints} recorded price points`
		: "Collecting price history...";
	card.append(header, metrics, detail);

	if (intelligence && intelligence.history.length >= 2) {
		card.append(createSparkline(intelligence.history));
	} else {
		const emptyState = document.createElement("p");
		emptyState.className = "mt-3 text-sm text-on-surface-variant";
		emptyState.textContent = "Collecting price history...";
		card.append(emptyState);
	}

	return card;
}
