import { assert } from "./worker-integration-http.mjs";

export async function testUtf8SourceUploadFilename({ client, env }) {
  const encodedChineseFilename = "估值表/\u0000中文\\文件名_20260710.txt";
  const storedChineseFilename = "估值表__中文_文件名_20260710.txt";
  const upload = await client.json("/api/source-files", {
    method: "POST",
    body: "label,value\n中文样本,1.1\n",
    headers: {
      "content-type": "text/plain",
      "x-filename": "fallback-source.txt",
      "x-filename-utf8": encodeURIComponent(encodedChineseFilename),
      "x-workspace-id": "default",
    },
  });
  const storedSource = await env.DB.prepare(
    "SELECT filename FROM source_files WHERE id = ? LIMIT 1",
  )
    .bind(upload.sourceFileId)
    .first();

  assert(
    storedSource?.filename === storedChineseFilename,
    "UTF-8 upload filename is decoded, sanitized, and persisted",
  );
}
