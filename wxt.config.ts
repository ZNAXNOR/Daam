import { defineConfig } from "wxt";
import tailwindcss from '@tailwindcss/vite';

const AMAZON_DOMAINS = [
	"https://*.amazon.in/*",
	"https://*.amazon.com/*",
	"https://*.amazon.co.uk/*",
	"https://*.amazon.de/*",
	"https://*.amazon.ca/*",
	"https://*.amazon.co.jp/*",
	"https://*.amazon.com.au/*",
];

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
	manifest: {
		name: "Daam — Price Intelligence",
		description: "Crowdsourced price verification and fake-discount detector.",
		permissions: ["storage"],
		host_permissions: [
			...AMAZON_DOMAINS,
			"*://*.flipkart.com/*",
		],
	},
    vite: () => ({
        plugins: [tailwindcss()],
  }),
});
