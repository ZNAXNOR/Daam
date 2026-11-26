import type { StorePlatform } from "@daam/contracts";
import { el } from "../primitives/dom";

export interface ReportContext {
	platform: StorePlatform;
	productId: string | null;
	pageUrl: string;
	errorCode: string;
	selectorVersion: string;
}

export function createReportButton(context: ReportContext): HTMLAnchorElement {
	const issueUrl = new URL("https://github.com/ZNAXNOR/Daam/issues/new");
	const details = [
		`Platform: ${context.platform}`,
		`ASIN: ${context.productId ?? "unknown"}`,
		`Page URL: ${context.pageUrl}`,
		`Error code: ${context.errorCode}`,
		`Selector version: ${context.selectorVersion}`,
	].join("\n");
	issueUrl.search = new URLSearchParams({
		title: `Daam issue: ${context.errorCode}`,
		body: details,
		platform: context.platform,
		asin: context.productId ?? "unknown",
		url: context.pageUrl,
		errorCode: context.errorCode,
		selectorVersion: context.selectorVersion,
	}).toString();

	return el("a", {
		className: "daam-report",
		href: issueUrl.toString(),
		target: "_blank",
		rel: "noopener noreferrer",
		textContent: "Report Issue",
	});
}
