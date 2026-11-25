import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootEnvPath = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../..",
	".env",
);
config({ path: rootEnvPath });

const { db } = await import("./index");
const { platforms, priceHistory, products, sellers } = await import("./schema");

const SEED_SELLER_ID = "daam:dev-seed:amazon-in";
const DAY_MS = 24 * 60 * 60 * 1000;

interface SeedProduct {
	productId: string;
	title: string;
	priceAt: (day: number) => number;
	mrp: number;
}

const seededProducts: SeedProduct[] = [
	{
		productId: "B08FXNP7CH",
		title: "Amazon India demo product - steady price",
		priceAt: (day) =>
			Math.round(14999 + Math.sin(day * 0.47) * 130 + Math.cos(day * 0.19) * 65),
		mrp: 19999,
	},
	{
		productId: "B07ZQDFG9R",
		title: "Amazon India demo product - pre-sale price spike",
		priceAt: (day) =>
			Math.round(
				day >= 83
					? 12999 + Math.sin(day * 0.63) * 140
					: 9999 + Math.sin(day * 0.41) * 110,
			),
		mrp: 14999,
	},
	{
		productId: "B0DY2SWV16",
		title: "Amazon India demo product - genuine price drop",
		priceAt: (day) =>
			Math.round(
				day >= 86
					? 15999 + Math.sin(day * 0.52) * 90
					: 19999 + Math.sin(day * 0.37) * 120,
			),
		mrp: 24999,
	},
];

async function seedProductHistory(): Promise<void> {
	const [platform] = await db
		.insert(platforms)
		.values({ name: "amazon_in" })
		.onConflictDoUpdate({
			target: platforms.name,
			set: { name: "amazon_in" },
		})
		.returning({ id: platforms.id });
	if (!platform) {
		throw new Error("Unable to resolve the Amazon India platform.");
	}

	const [seller] = await db
		.insert(sellers)
		.values({ platformSellerId: SEED_SELLER_ID, name: "Daam development seed" })
		.onConflictDoUpdate({
			target: sellers.platformSellerId,
			set: { name: "Daam development seed" },
		})
		.returning({ id: sellers.id });
	if (!seller) {
		throw new Error("Unable to resolve the development seed seller.");
	}

	const now = Date.now();
	for (const productSeed of seededProducts) {
		const [product] = await db
			.insert(products)
			.values({
				platformId: platform.id,
				productId: productSeed.productId,
				title: productSeed.title,
			})
			.onConflictDoUpdate({
				target: [products.platformId, products.productId],
				set: { title: productSeed.title },
			})
			.returning({ id: products.id });
		if (!product) {
			throw new Error(`Unable to resolve seed product "${productSeed.productId}".`);
		}

		await db
			.delete(priceHistory)
			.where(
				and(
					eq(priceHistory.productId, product.id),
					eq(priceHistory.sellerId, seller.id),
				),
			);

		const observations = Array.from({ length: 90 }, (_, day) => ({
			productId: product.id,
			sellerId: seller.id,
			dealPrice: productSeed.priceAt(day),
			mrp: productSeed.mrp,
			inStock: true,
			recordedAt: new Date(now - (89 - day) * DAY_MS),
		}));

		await db.insert(priceHistory).values(observations);
		console.info(
			`Seeded 90 days for amazon_in/${productSeed.productId}.`,
		);
	}
}

seedProductHistory().catch((error: unknown) => {
	console.error("Development price-history seed failed.", error);
	process.exitCode = 1;
});
