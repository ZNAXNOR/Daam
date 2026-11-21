import { defineConfig } from "wxt";
import tailwindcss from '@tailwindcss/vite';
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

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
	manifest: {
		name: "Daam — Price Intelligence",
		description: "Crowdsourced price verification and fake-discount detector.",
		permissions: ["storage"],
		host_permissions: [
			"http://localhost:3002/*",
			...AMAZON_DOMAINS,
			"*://*.flipkart.com/*",
		],
	},
  vite: (env) => {
    const envDir = path.resolve(__dirname, "../..");
    const rootEnvPath = path.join(envDir, ".env");
    const rootEnv = fs.existsSync(rootEnvPath)
      ? fs.readFileSync(rootEnvPath, "utf8")
      : "";
    const apiUrlMatch = rootEnv.match(/^WXT_API_URL=(.*)$/m);
    const apiUrl = apiUrlMatch?.[1]?.trim().replace(/^["']|["']$/g, "")
      ?? "http://localhost:3002";

    return {
      envDir,
      envPrefix: ["WXT_"],
      define: {
        "import.meta.env.WXT_API_URL": JSON.stringify(
          apiUrl,
        ),
      },
      plugins: [tailwindcss()],
    };
  },
});
