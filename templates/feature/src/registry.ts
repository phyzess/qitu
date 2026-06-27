import { importFeatureAdapter } from "./import-feature";

export const featureImportAdapters = [importFeatureAdapter] as const;

export type RegisteredFeatureImportAdapter = (typeof featureImportAdapters)[number];

export function selectFeatureImportAdapter(source: {
  filename: string;
  contentType: string;
}): RegisteredFeatureImportAdapter | null {
  return featureImportAdapters.find((adapter) => adapter.canHandle(source)) ?? null;
}
