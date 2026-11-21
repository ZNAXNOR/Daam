import "./style.css";

interface SyncStatus {
	stage: "idle" | "pushing" | "pushed" | "error";
	message?: string;
	updatedAt: number;
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
	throw new Error("Popup root not found.");
}

app.innerHTML = `
  <main class="popup">
    <div class="wordmark">Daam</div>
    <footer class="sync-footer" aria-live="polite"></footer>
  </main>
`;

const footer = app.querySelector<HTMLElement>(".sync-footer")!;

const loaderIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2v4"></path><path d="m16.2 7.8 2.9-2.9"></path>
    <path d="M18 12h4"></path><path d="m16.2 16.2 2.9 2.9"></path>
    <path d="M12 18v4"></path><path d="m4.9 19.1 2.9-2.9"></path>
    <path d="M2 12h4"></path><path d="M4.9 4.9 7.8 7.8"></path>
  </svg>`;

const checkIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path>
  </svg>`;

const alertIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path>
  </svg>`;

function renderStatus(status: SyncStatus | undefined): void {
	footer.className = "sync-footer";

	if (!status || status.stage === "idle") {
		footer.replaceChildren();
		return;
	}

	if (
		status.stage === "pushed" &&
		status.updatedAt &&
		Date.now() - status.updatedAt >= 15_000
	) {
		footer.replaceChildren();
		return;
	}

	if (status.stage === "pushing") {
		footer.classList.add("visible", "pushing");
		footer.innerHTML = `${loaderIcon}<span>Pushing data...</span>`;
		return;
	}

	if (status.stage === "pushed") {
		footer.classList.add("visible", "pushed");
		footer.innerHTML = `${checkIcon}<span>Thanks for your contribution</span>`;
		return;
	}

	footer.classList.add("visible", "error");
	footer.innerHTML = `${alertIcon}<span>${status.message ?? "Sync error"}</span>`;
}

async function loadStatus(): Promise<void> {
	const stored = await browser.storage.local.get("daam_sync_status");
	renderStatus(stored.daam_sync_status as SyncStatus | undefined);
}

browser.storage.onChanged.addListener((changes, areaName) => {
	if (areaName !== "local" || !changes.daam_sync_status) {
		return;
	}
	renderStatus(changes.daam_sync_status.newValue as SyncStatus | undefined);
});

void loadStatus();
