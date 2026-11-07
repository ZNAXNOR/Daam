import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getDailyExportData } from "@/src/db/queries";

function escapeCsvValue(value: unknown): string {
	const stringValue = value instanceof Date
		? value.toISOString()
		: String(value ?? "");

	return `"${stringValue.replaceAll('"', '""')}"`;
}

function toCsv(
	rows: Awaited<ReturnType<typeof getDailyExportData>>,
): string {
	const headers = [
		"product_id",
		"platform",
		"title",
		"deal_price",
		"mrp",
		"seller_id",
		"recorded_at",
	];
	const records = rows.map((row) =>
		[
			row.productId,
			row.platform,
			row.title,
			row.dealPrice,
			row.mrp,
			row.platformSellerId,
			row.recordedAt,
		]
			.map(escapeCsvValue)
			.join(","),
	);

	return [headers.map(escapeCsvValue).join(","), ...records].join("\n");
}

export async function GET(request: Request): Promise<Response> {
	const cronSecret = process.env.CRON_SECRET;
	const authorization = request.headers.get("authorization");

	if (
		!cronSecret ||
		authorization !== `Bearer ${cronSecret}`
	) {
		return Response.json(
			{ success: false, error: "Unauthorized." },
			{ status: 401 },
		);
	}

	const accountId = process.env.R2_ACCOUNT_ID;
	const bucketName = process.env.R2_BUCKET_NAME;
	const accessKeyId = process.env.R2_ACCESS_KEY_ID;
	const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
	if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) {
		console.error("Daily export is missing R2 configuration.");
		return Response.json(
			{ success: false, error: "Export storage is not configured." },
			{ status: 500 },
		);
	}

	try {
		const rows = await getDailyExportData();
		const csv = toCsv(rows);
		const fileName = `daam-daily-${new Date().toISOString().split("T")[0]}.csv`;
		const s3Client = new S3Client({
			region: "auto",
			endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
			credentials: {
				accessKeyId,
				secretAccessKey,
			},
		});

		await s3Client.send(
			new PutObjectCommand({
				Bucket: bucketName,
				Key: fileName,
				Body: csv,
				ContentType: "text/csv",
			}),
		);

		return Response.json({
			success: true,
			fileName,
			recordCount: rows.length,
		});
	} catch (error) {
		console.error("Daily export failed.", error);
		return Response.json(
			{ success: false, error: "Unable to generate daily export." },
			{ status: 500 },
		);
	}
}
