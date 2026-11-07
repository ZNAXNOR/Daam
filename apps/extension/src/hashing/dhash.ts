export interface DHashOptions {
	width?: number;
	height?: number;
}

const DEFAULT_OPTIONS: Required<DHashOptions> = {
	width: 8,
	height: 8,
};

function luminance(red: number, green: number, blue: number): number {
	return red * 0.299 + green * 0.587 + blue * 0.114;
}

export function computeDHash(
	source: CanvasImageSource,
	options: DHashOptions = {},
): string {
	const { width, height } = { ...DEFAULT_OPTIONS, ...options };
	const canvas = document.createElement("canvas");
	canvas.width = width + 1;
	canvas.height = height;

	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) {
		throw new Error("Unable to create a 2D canvas context for dHash");
	}

	context.drawImage(source, 0, 0, width + 1, height);
	const pixels = context.getImageData(0, 0, width + 1, height).data;
	let bits = "";

	for (let row = 0; row < height; row += 1) {
		for (let column = 0; column < width; column += 1) {
			const left = (row * (width + 1) + column) * 4;
			const right = left + 4;
			const leftGray = luminance(
				pixels[left] ?? 0,
				pixels[left + 1] ?? 0,
				pixels[left + 2] ?? 0,
			);
			const rightGray = luminance(
				pixels[right] ?? 0,
				pixels[right + 1] ?? 0,
				pixels[right + 2] ?? 0,
			);
			bits += leftGray < rightGray ? "1" : "0";
		}
	}

	return Number.parseInt(bits, 2).toString(16).padStart(16, "0");
}
