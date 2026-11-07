import { NextResponse } from "next/server";
import { getProductHistory } from "@/src/db/queries";

const CACHE_CONTROL =
	"public, s-maxage=60, stale-while-revalidate=300";
const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

interface ProductHistoryRouteContext {
	params: Promise<{
		platform: string;
		id: string;
	}>;
}

export async function GET(
	_request: Request,
	context: ProductHistoryRouteContext,
): Promise<Response> {
	const { platform, id } = await context.params;

	try {
		const product = await getProductHistory(platform, id);

		if (!product) {
			return NextResponse.json(
				{ error: "Product not found." },
				{
					status: 404,
					headers: { "Cache-Control": CACHE_CONTROL },
				},
			);
		}

		const latest = product.history[0];
		const stale =
			latest?.recordedAt === null || latest?.recordedAt === undefined
				? true
				: Date.now() - latest.recordedAt.getTime() > STALE_AFTER_MS;

		return NextResponse.json(
			{
				title: product.title,
				history: product.history,
				stale,
			},
			{
				headers: { "Cache-Control": CACHE_CONTROL },
			},
		);
	} catch (error) {
		console.error("Product history lookup failed.", error);
		return NextResponse.json(
			{ error: "Unable to fetch product history." },
			{ status: 500 },
		);
	}
}
