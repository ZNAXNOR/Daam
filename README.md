# Daam

> **Open-source price intelligence, fake-discount detector, and crowdsourced shopping data collective.**

Daam is a lightweight, privacy-first browser extension and open-data platform that reveals instantly whether an e-commerce discount is genuine or an artificial pre-sale price hike—without bloated charts, intrusive popups, or affiliate cookie hijacking.

---

## Core Pillars

### **3-Layer "Onion" UI (Material Design 3):**
  - **Layer 1 (Inline M3 Chip):** A featherlight 32px badge beneath the product price with an objective verdict (`🟢 True Deal · 22% below 90d avg`, `🔴 List Price Inflated`, or `🌱 First Explorer`).
  - **Layer 2 (Quick Popover):** Click or hover to view a zero-dependency SVG sparkline, True Effective Price (including on-page coupons), and seller check.
  - **Layer 3 (Daam Web Hub):** Full multi-year interactive charts, variant tables, price-drop alerts, and raw CSV/Parquet open-data downloads.
### **100% Privacy-First & Zero Login:** 
No account required, zero personal browsing history tracked, and URL tracking parameters stripped client-side.
### **Crowdsourced & Open Data:** 
Powered by passive community browsing and 64-bit client-side perceptual image hashing (`dHash`) to catch relisted and white-label duplicate items across stores.

---

## AI-Assisted Development & Architecture Docs

> **Using an AI Coding Assistant (Gemini, Cursor, Copilot, Claude)?**  
> Read **[`GEMINI.md`](./GEMINI.md)** before writing or generating any code. It contains our strict vibe-coding guardrails, official documentation links, modular folder rules, and core TypeScript contracts.

---

## Getting Started

### Current implementation milestone

The extension sensor currently provides:

- typed product and ingestion contracts in `src/contracts/`;
- Amazon product-page extraction with exchange-price protection and payload validation;
- client-side 64-bit dHash generation for loaded product images;
- cached selector configuration through WXT storage;
- up to 42 Amazon search-card snapshots sent to the background batch queue.

The backend ingestion API, web hub, and additional retailer modules remain
separate roadmap features and should be implemented in their own repositories.

### Database foundation

The initial Neon/Drizzle schema is isolated under `src/db/` so server-only
database code is not imported into the browser extension entrypoints.

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to a Neon PostgreSQL
   connection string. Never commit `.env`.
2. Generate a migration after schema changes:

   ```bash
   pnpm db:generate
   ```

3. Apply tracked migrations to the configured database:

   ```bash
   pnpm db:migrate
   ```

For quick development-only schema iteration, Drizzle Kit also exposes:

```bash
pnpm db:push
```

The schema uses integer identity keys and lookup foreign keys so
`price_history` does not repeat platform or seller strings.

### 1. Prerequisites (`Node.js` & `pnpm`)

Make sure you have **Node.js (v20+)** installed. This project strictly uses **`pnpm`**.

**Don't have `pnpm` installed?** Enable it in 5 seconds using Node's built-in Corepack (no global npm install needed):

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

*(Alternatively, install via standalone script or npm: `npm install -g pnpm`)*

Verify your installation:

```bash
node -v
pnpm -v
```

### 2. Clone & Install

```bash
git clone [https://github.com/ZNAXNOR/Daam.git](https://github.com/ZNAXNOR/Daam.git)
cd Daam
pnpm install
```

### 3. Run the Extension in Development Mode

```bash
# Start WXT dev server (opens a dedicated Chrome instance with Hot Reload)
pnpm dev

# Or run in Firefox
pnpm dev:firefox
```

### 4. Build for Production

```bash
# Typecheck the codebase
pnpm compile

# Build production bundle (.output/)
pnpm build

# Package into store-ready .zip files
pnpm zip
```

---

## Tech Stack

* **Extension Sensor:** [WXT Framework](https://wxt.dev) (Manifest V3, TypeScript, Shadow DOM UI)
* **Styling:** [Tailwind CSS v4](https://tailwindcss.com/docs) mapped to [Material Design 3 Tokens](https://m3.material.io)
* **API & Web Hub:** [Hono](https://hono.dev) + Next.js deployed via Dokploy
* **Database:** PostgreSQL + [Drizzle ORM](https://orm.drizzle.team) (Write-on-change time-series deduplication)
* **Edge & Open Data Storage:** Cloudflare CDN & Cloudflare R2

---

## License

Released under the [MIT License](https://www.google.com/search?q=./LICENSE).