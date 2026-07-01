import { createAuditEvent } from "@qitu/audit";
import { prepareAuditInsert } from "./audit-store";
import { createSourceFileImportJob } from "./source-intake";

type ParsedAttachment = {
  content: ArrayBuffer;
  contentType: string;
  filename: string;
  size: number;
};

export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<void> {
  const receivedAt = new Date().toISOString();
  const inboundEmailId = crypto.randomUUID();
  const rawObjectKey = `raw-emails/${receivedAt.slice(0, 10)}/${inboundEmailId}.eml`;
  const rawBytes = await new Response(message.raw).arrayBuffer();
  const rawText = new TextDecoder().decode(rawBytes);
  const subject = message.headers.get("subject") ?? undefined;

  await env.SOURCE_FILES.put(rawObjectKey, rawBytes, {
    customMetadata: {
      from: message.from,
      inboundEmailId,
      to: message.to,
    },
    httpMetadata: {
      contentType: "message/rfc822",
    },
  });

  const attachments = parseMimeAttachments(rawText);
  const attachmentResults = [];

  for (const attachment of attachments) {
    const intake = await createSourceFileImportJob(env, {
      actor: {
        id: "system:inbound-email",
        kind: "system",
      },
      content: attachment.content,
      contentType: attachment.contentType,
      filename: attachment.filename,
      metadata: {
        inboundEmailId,
        rawObjectKey,
        source: "inbound_email",
      },
      workspaceId: "default",
    });

    attachmentResults.push({
      attachment,
      intake,
    });
  }

  const status =
    attachmentResults.length === 0
      ? "stored"
      : attachmentResults.some((result) => !result.intake.ok)
        ? "partial"
        : "queued";

  await env.DB.batch([
    env.DB.prepare(
      `
        INSERT INTO inbound_email_messages (
          id,
          from_email,
          to_email,
          subject,
          raw_object_key,
          raw_size,
          attachment_count,
          status,
          metadata_json,
          received_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).bind(
      inboundEmailId,
      message.from,
      message.to,
      subject ?? null,
      rawObjectKey,
      message.rawSize,
      attachments.length,
      status,
      JSON.stringify({ parser: "qitu-minimal-mime" }),
      receivedAt,
    ),
    ...attachmentResults.map((result) =>
      env.DB.prepare(
        `
          INSERT INTO inbound_email_attachments (
            id,
            inbound_email_id,
            filename,
            content_type,
            size,
            source_file_id,
            import_job_id,
            object_key,
            status,
            error_message,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).bind(
        crypto.randomUUID(),
        inboundEmailId,
        result.attachment.filename,
        result.attachment.contentType,
        result.attachment.size,
        result.intake.ok ? result.intake.sourceFileId : (result.intake.sourceFileId ?? null),
        result.intake.ok ? result.intake.importJobId : (result.intake.importJobId ?? null),
        result.intake.ok ? result.intake.objectKey : (result.intake.objectKey ?? null),
        result.intake.ok ? (result.intake.duplicate ? "duplicate" : "queued") : "failed",
        result.intake.ok ? null : result.intake.message,
        receivedAt,
      ),
    ),
    prepareAuditInsert(
      env,
      createAuditEvent({
        action: "inbound_email.received",
        actor: {
          id: "system:inbound-email",
          kind: "system",
        },
        metadata: {
          attachmentCount: attachments.length,
          from: message.from,
          rawObjectKey,
          status,
          subject,
          to: message.to,
        },
        subject: {
          id: inboundEmailId,
          kind: "inbound_email",
        },
      }),
    ),
  ]);
}

export function parseMimeAttachments(rawEmail: string): ParsedAttachment[] {
  const boundary = boundaryFromContentType(headerValue(rawEmail, "content-type"));
  if (!boundary) return [];

  return rawEmail
    .split(`--${boundary}`)
    .map((part) => part.trim())
    .filter((part) => part && part !== "--")
    .map(parseMimePart)
    .filter((part): part is ParsedAttachment => Boolean(part));
}

function parseMimePart(part: string): ParsedAttachment | null {
  const separator = part.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
  const separatorIndex = part.indexOf(separator);
  if (separatorIndex < 0) return null;

  const headerText = part.slice(0, separatorIndex);
  const body = part
    .slice(separatorIndex + separator.length)
    .replace(/\r?\n--$/, "")
    .trim();
  const disposition = headerValue(headerText, "content-disposition");
  if (!/attachment/i.test(disposition)) return null;

  const filename = parameterFromHeader(disposition, "filename") ?? "attachment.bin";
  const contentType = headerValue(headerText, "content-type") || "application/octet-stream";
  const transferEncoding = headerValue(headerText, "content-transfer-encoding").toLowerCase();
  const bytes =
    transferEncoding === "base64" ? base64ToBytes(body.replace(/\s+/g, "")) : textToBytes(body);

  return {
    content: bytesToArrayBuffer(bytes),
    contentType: contentType.split(";")[0]?.trim() || "application/octet-stream",
    filename,
    size: bytes.byteLength,
  };
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function headerValue(headerText: string, name: string): string {
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, " ");
  const pattern = new RegExp(`^${escapeRegExp(name)}:\\s*(.+)$`, "im");
  return unfolded.match(pattern)?.[1]?.trim() ?? "";
}

function boundaryFromContentType(contentType: string): string | null {
  return parameterFromHeader(contentType, "boundary");
}

function parameterFromHeader(header: string, name: string): string | null {
  const pattern = new RegExp(`${escapeRegExp(name)}=(?:"([^"]+)"|([^;\\s]+))`, "i");
  const match = header.match(pattern);
  return match?.[1] ?? match?.[2] ?? null;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function textToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
