import type { ProductPayload } from "../contracts/product";

export interface HarvestProductsMessage {
	type: "DAAM_HARVEST_PRODUCTS";
	payloads: ProductPayload[];
}

export type DaamRuntimeMessage = HarvestProductsMessage;
