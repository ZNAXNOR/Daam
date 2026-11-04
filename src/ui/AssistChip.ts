export function createAssistChip<T extends object>(data: T): HTMLPreElement {
	const chip = document.createElement("pre");
	chip.dataset.daamChip = "true";
	chip.textContent = JSON.stringify(data, null, 2);
	chip.style.whiteSpace = "pre-wrap";
	chip.style.margin = "8px";
	return chip;
}
