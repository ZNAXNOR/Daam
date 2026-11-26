import { NextResponse } from "next/server";
import { getProductIntelligence } from "@/src/db/queries";
import { logger } from "@/src/logger";

const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

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
		const intelligence = await getProductIntelligence(platform, id);

		if (!intelligence) {
			return NextResponse.json(
				{ error: "Product not found." },
				{
					status: 404,
					headers: { "Cache-Control": "no-store" },
				},
			);
		}

		return NextResponse.json(intelligence, {
			headers: { "Cache-Control": CACHE_CONTROL },
		});
	} catch {
		logger.dbConnectionFailed();
		return NextResponse.json({ error: "Unable to fetch product history." }, { status: 500 });
	}
}
