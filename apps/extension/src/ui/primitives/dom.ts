export type DomChild = Node | string | number | null | undefined | false;
export type DomProps = Record<string, unknown>;

export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: DomProps | null = null,
	...children: DomChild[]
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);

	for (const [key, value] of Object.entries(props ?? {})) {
		if (value === undefined || value === null || value === false) {
			continue;
		}
		if (key === "className") {
			element.className = String(value);
		} else if (key === "textContent") {
			element.textContent = String(value);
		} else if (key.startsWith("on") && typeof value === "function") {
			element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
		} else if (key === "hidden" && typeof value === "boolean") {
			element.hidden = value;
		} else if (typeof value === "boolean") {
			element.toggleAttribute(key, value);
		} else {
			element.setAttribute(key, String(value));
		}
	}

	for (const child of children) {
		if (child instanceof Node) {
			element.append(child);
		} else if (child !== null && child !== undefined && child !== false) {
			element.append(document.createTextNode(String(child)));
		}
	}

	return element;
}
