import { apiJson, withSearch } from "./api-client";
import type { SourceFile } from "./types";

export type SourceFilesResponse = {
  sourceFiles: SourceFile[];
};

export async function listSourceFiles(
  input: {
    workspaceId?: string;
    limit?: number;
  } = {},
): Promise<SourceFilesResponse> {
  const search = new URLSearchParams();
  if (input.workspaceId) search.set("workspaceId", input.workspaceId);
  if (input.limit) search.set("limit", String(input.limit));
  return apiJson<SourceFilesResponse>(withSearch("/api/source-files", search));
}

export async function uploadSourceFile(input: { file: File; workspaceId?: string }): Promise<{
  sourceFileId: string;
  importJobId: string;
  objectKey: string;
  status: string;
  duplicate?: boolean;
}> {
  return apiJson("/api/source-files", {
    method: "POST",
    body: input.file,
    headers: {
      "content-type": input.file.type || "application/octet-stream",
      "x-filename": asciiHeaderFallback(input.file.name),
      "x-filename-utf8": encodeURIComponent(input.file.name),
      "x-workspace-id": input.workspaceId ?? "default",
    },
  });
}

function asciiHeaderFallback(value: string): string {
  const fallback = value
    .replace(/[\r\n]/g, "_")
    .replace(/[^\x20-\x7E]/g, "_")
    .trim();
  return fallback || "source.bin";
}
