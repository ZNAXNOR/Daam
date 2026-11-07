let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function watchForChanges(callback: () => void): MutationObserver {
	const target = document.body;
	console.info("[Daam] observer attached", {
		target: target?.tagName ?? null,
	});
	const observer = new MutationObserver((records) => {
		const pageChanged = records.some((record) => {
			if (record.target instanceof Element && record.target.closest("[data-daam-ui]")) {
				return false;
			}

			return Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some((node) => {
				return !(node instanceof Element && (
					node.matches("[data-daam-ui]") || node.closest("[data-daam-ui]")
				));
			});
		});
		if (!pageChanged) {
			return;
		}

		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
		}

		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			console.info("[Daam] observer callback scheduled");
			callback();
		}, 800);
	});

	observer.observe(target, { childList: true, subtree: true, characterData: true });
	return observer;
}
