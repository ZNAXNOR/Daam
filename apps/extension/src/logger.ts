export const logger = {
	chipMountFailed(): void {
		console.error("[Daam] Chip mount failed: anchor not found");
	},
	dataFetchFailed(): void {
		console.error("[Daam] Data fetch failed");
	},
	dataSendFailed(): void {
		console.error("[Daam] Data send failed");
	},
};
