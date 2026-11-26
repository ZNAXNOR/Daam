import bundledSelectors from "./selectors.json";

const SELECTORS_CACHE_KEY = "daam_selectors_cache";
const SELECTORS_TTL_MS = 24 * 60 * 60 * 1000;

type SelectorGroups = typeof bundledSelectors;

interface CachedSelectors {
	selectors: SelectorGroups;
	fetchedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isSelectorGroups(value: unknown): value is SelectorGroups {
	if (!isRecord(value)) {
		return false;
	}

	return Object.entries(bundledSelectors).every(([platform, localGroup]) => {
		const remoteGroup = value[platform];
		return (
			isRecord(remoteGroup) &&
			Object.keys(localGroup).every(
				(key) =>
					Array.isArray(remoteGroup[key]) &&
					remoteGroup[key].every((selector) => typeof selector === "string"),
			)
		);
	});
}

function isCachedSelectors(value: unknown): value is CachedSelectors {
	return (
		isRecord(value) &&
		typeof value.fetchedAt === "number" &&
		Number.isFinite(value.fetchedAt) &&
		isSelectorGroups(value.selectors)
	);
}

export async function loadSelectors(): Promise<SelectorGroups> {
	try {
		const stored = await browser.storage.local.get(SELECTORS_CACHE_KEY);
		const cached = stored[SELECTORS_CACHE_KEY];
		if (
			isCachedSelectors(cached) &&
			Date.now() - cached.fetchedAt >= 0 &&
			Date.now() - cached.fetchedAt < SELECTORS_TTL_MS
		) {
			return cached.selectors;
		}
	} catch {}

	try {
		const selectorsUrl = import.meta.env.WXT_SELECTORS_URL;
		if (!selectorsUrl) {
			throw new Error("WXT_SELECTORS_URL is not configured.");
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5_000);
		let response: Response;
		try {
			response = await fetch(selectorsUrl, { signal: controller.signal });
		} finally {
			clearTimeout(timeout);
		}
		if (!response.ok) {
			throw new Error(`Selector request failed with status ${response.status}.`);
		}

		const selectors: unknown = await response.json();
		if (!isSelectorGroups(selectors)) {
			throw new Error("Remote selector configuration has an invalid shape.");
		}

		try {
			await browser.storage.local.set({
				[SELECTORS_CACHE_KEY]: { selectors, fetchedAt: Date.now() },
			});
		} catch {}

		return selectors;
	} catch {
		return bundledSelectors;
	}
}
