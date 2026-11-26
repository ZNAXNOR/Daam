import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";

const AMAZON_DOMAINS = [
	"https://*.amazon.in/*",
	"https://*.amazon.com/*",
	"https://*.amazon.co.uk/*",
	"https://*.amazon.de/*",
	"https://*.amazon.ca/*",
	"https://*.amazon.co.jp/*",
	"https://*.amazon.com.au/*",
];

const envDir = path.resolve(__dirname, "../..");

function readEnvValue(envPath: string, key: string): string | undefined {
	if (!fs.existsSync(envPath)) {
		return undefined;
	}
	const env = fs.readFileSync(envPath, "utf8");
	const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
	return match?.[1]?.trim().replace(/^['"]|['"]$/g, "");
}

const apiUrl =
	readEnvValue(path.join(envDir, ".env"), "WXT_API_URL") ??
	readEnvValue(path.join(__dirname, ".env"), "WXT_API_URL") ??
	"http://localhost:3002";
const apiOrigin = new URL(apiUrl).origin;
const selectorsUrl =
	readEnvValue(path.join(envDir, ".env"), "WXT_SELECTORS_URL") ??
	readEnvValue(path.join(__dirname, ".env"), "WXT_SELECTORS_URL") ??
	"https://raw.githubusercontent.com/ZNAXNOR/Daam/refs/heads/Dev/Plugin/apps/extension/src/config/selectors.json";

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
	manifest: {
		name: "Daam — Price Intelligence",
		description: "Crowdsourced price verification and fake-discount detector.",
		permissions: ["storage", "alarms"],
		host_permissions: [
			`${apiOrigin}/*`,
			...AMAZON_DOMAINS,
			"*://*.flipkart.com/*",
			"https://raw.githubusercontent.com/*",
		],
	},
	vite: (env) => {
		return {
			envDir,
			envPrefix: ["WXT_"],
			define: {
				"import.meta.env.WXT_API_URL": JSON.stringify(apiUrl),
				"import.meta.env.WXT_SELECTORS_URL": JSON.stringify(selectorsUrl),
			},
			plugins: [tailwindcss()],
		};
	},
});
