import type { ProductPayload } from "@daam/contracts";

export interface HarvestProductsMessage {
	type: "DAAM_HARVEST_PRODUCTS";
	payloads: ProductPayload[];
}

export type DaamRuntimeMessage = HarvestProductsMessage;
