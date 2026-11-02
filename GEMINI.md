# GEMINI.md — AI Coding & Architecture Constitution for Daam

**Repository:** https://github.com/ZNAXNOR/Daam  
**Package Manager:** `pnpm` (Strictly enforced — NEVER use `npm` or `yarn`)  
**Project Scope:** Global Open-Source Price Intelligence, Fake-Discount Detector & Crowdsourced Shopping Data Collective.

---

## 1. STRICT VIBE-CODING OPERATIONAL GUARDRAILS

All AI coding assistants and contributors MUST enforce these five rules on every prompt and code generation step:

1. **Strict Adherence to Official Documentation:**
   - Only use documented, current APIs from our designated stack (WXT, Chrome Manifest V3 `ExecutionWorld.MAIN`, Drizzle ORM, Hono, Tailwind CSS v4, and Material Design 3).
   - NEVER hallucinate deprecated Manifest V2 APIs (`chrome.webRequestBlocking`), legacy Plasmo patterns, or incompatible major version syntax.
2. **Zero Unnecessary R&D (Do Not Reinvent the Wheel):**
   - Do not write custom state managers, custom bundler plugins, or bespoke utility abstractions when canonical framework primitives exist.
   - Use WXT's built-in `createContentScriptUi` for Shadow DOM mounting and `storage.defineItem` for `chrome.storage.local`.
3. **Open-Source & Reference-First Protocol:**
   - Before writing complex parsing or UI logic from scratch (e.g., `window.fetch` interception, zero-dependency SVG sparklines, or 64-bit `<canvas>` dHash), check battle-tested open-source implementations and standard algorithms first.
4. **Strict Feature Isolation (Modular Folders):**
   - Every feature must live in its own isolated module directory (`src/extractors/amazon/`, `src/extractors/flipkart/`, `src/hashing/`, `src/ui/`).
   - Modifying one store's DOM extractor must NEVER affect another store's extractor or the UI layer.
5. **Self-Documenting Code & Explicit Type Contracts:**
   - Every function, payload, and extractor must have explicit TypeScript interfaces.
   - Include concise inline comments explaining *why* a specific DOM fallback, sanity check, or anti-bot precaution exists.

---

## 2. OFFICIAL DOCUMENTATION & REFERENCE LINKS

When implementing features, reference these exact official docs:

- **Extension Framework — WXT:** https://wxt.dev
  - Content Script UI (Shadow DOM): https://wxt.dev/guide/essentials/content-scripts.html#mounting-ui
  - Storage API (`wxt/storage`): https://wxt.dev/storage.html
- **Chrome Manifest V3 `ExecutionWorld.MAIN`:** https://developer.chrome.com/docs/extensions/reference/api/scripting#type-ExecutionWorld
- **Styling — Tailwind CSS v4:** https://tailwindcss.com/docs
- **Design System — Google Material Design 3 (M3):** https://m3.material.io
- **Backend Framework — Hono:** https://hono.dev/docs/
- **Database & Migrations — Drizzle ORM (PostgreSQL):** https://orm.drizzle.team/docs/overview
- **Serverless Postgres — Neon:** https://neon.tech/docs/introduction
- **Edge Caching & Zero-Egress Object Storage — Cloudflare R2 & Cache:**
  - Cache Control: https://developers.cloudflare.com/cache/
  - R2 Storage: https://developers.cloudflare.com/r2/

---

## 3. ARCHITECTURAL NON-NEGOTIABLES (DOs & DON'Ts)

### Database & Backend Rules
- **NO Firebase (Firestore) or Supabase:** We do not use Firestore (per-read/write billing trap on bulk search harvests) or Supabase (unnecessary Auth/RLS overhead and 500MB free cap).
- **Use Standard PostgreSQL via Drizzle ORM:** Start on Neon for dev/branching; deploy production on self-hosted PostgreSQL inside Dokploy (Oracle Cloud Always Free Tier) fronted by Cloudflare CDN.
- **Write-On-Change Deduplication:** NEVER insert a new row into `price_history` if `incoming_price === current_price && incoming_mrp === current_mrp`. Only update `last_seen_at` on the `products` table. Append to `price_history` strictly when price, MRP, or coupon values change.

### Extraction & Vision Rules
- **NO Server-Side Scraping (No Playwright/Selenium in Prod):** All extraction happens passively inside the user's browser via the extension.
- **NO Paid Cloud Vision LLMs on Full Pages:** Never send full-page screenshots to OpenAI/Gemini Vision APIs.
- **Use 64-Bit Client-Side Canvas `dHash`:** Compute thumbnail perceptual hashes locally in `<1ms` using an invisible `9x8` HTML5 `<canvas>` to detect duplicate/relisted items at $0 cost.
- **4-Tier Extraction Hierarchy:**
  1. Hidden machine inputs (`input#ASIN`, `input#merchantID`) & `<script type="application/ld+json">`.
  2. `ExecutionWorld.MAIN` hydration state (`window.__INITIAL_STATE__`) & `window.fetch` response cloning for SPAs (Flipkart, Walmart).
  3. Remote fallback selectors (`selectors.json` fetched daily from CDN and cached in `chrome.storage.local`).
  4. Client-side math sanity validator (`dealPrice > 0`, `dealPrice <= mrp * 1.05`, `inStock === true`, and active Buy Box is `"New"` without trade-in/exchange selected).
- **Search Page 42-for-1 Bulk Harvesting:** On search pages (`/s?k=`), harvest all product cards with a canonical `data-asin` / `product_id` attribute and batch-flush them from the background service worker every 15–30 seconds.

### UI/UX Rules ("Onion" Progressive Disclosure)
- **Shadow DOM Isolation:** Always mount UI inside an isolated Shadow DOM (`mode: 'open'`) so host retailer styles never leak in.
- **Zero Layout Shift (CLS):** Reserve exact `32px` height immediately with a shimmer skeleton before the API resolves.
- **3 Layers Only:**
  - **Layer 1 (Surface):** Single 32px M3 Assist Chip below the price (`🟢 True Deal`, `🔴 List Price Inflated`, `🌱 First Explorer`). Use objective math facts—never legally risky phrases like `"Scam"` or `"False Advert"`.
  - **Layer 2 (First Peel):** 320px M3 Elevated Popover Card on click/hover with a zero-dependency inline SVG Sparkline, 90-day min/avg/effective price, and local contribution counter.
  - **Layer 3 (Core Peel):** Link out to the Daam Web Hub (`/[store]/[product_id]`) for heavy multi-year charts, alerts, and CSV/Parquet exports.
- **Tailwind Color Mapping:** Stick strictly to documented Tailwind classes mapped to the closest Material Design 3 surface, primary, and semantic status tokens (supporting `prefers-color-scheme: dark`).

---

## 4. CORE TYPE CONTRACTS

```typescript
export type StorePlatform = 'amazon_in' | 'amazon_us' | 'flipkart' | 'walmart' | 'target';

export interface ProductPayload {
  platform: StorePlatform;
  productId: string;        // Canonical immutable ID (ASIN, FSN, SKU)
  title: string;
  dealPrice: number;        // Headline selling price (without trade-in/exchange)
  mrp?: number;             // Strikethrough list price / MSRP
  currency: string;         // ISO 4217 ('INR', 'USD', 'EUR', 'GBP')
  couponDiscount?: number;  // On-page checkbox/clip coupon amount
  inStock: boolean;
  sellerName?: string;
  imageHash?: string;       // 16-char hex string from 64-bit canvas dHash
  extractionMethod: 'ld_json' | 'main_state' | 'dom_selector';
  timestamp: number;
}

export interface IngestionResponse {
  success: boolean;
  action: 'INSERTED_PRICE_CHANGE' | 'SKIPPED_DEDUPLICATED' | 'REJECTED_ANOMALY';
  productId: string;
}
```

---

## 5. ENVIRONMENT & PNPM COMMAND CHEATSHEET

If `pnpm` is not installed on the machine, enable it via Node's built-in Corepack:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

Common development commands:

```bash
pnpm install          # Install dependencies
pnpm dev              # Launch WXT extension in Chromium with HMR
pnpm dev:firefox      # Launch WXT extension in Firefox
pnpm build            # Build production extension bundle
pnpm zip              # Package extension into a distributable .zip for store upload
pnpm compile          # Run TypeScript typechecking (tsc --noEmit)
```