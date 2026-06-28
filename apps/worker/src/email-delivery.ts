import { type EmailDeliveryStatus, type EmailMessage } from "@qitu/email";
import { appName, runtimeConfig } from "./runtime";

export async function deliverEmail(
  env: Env,
  input: {
    kind: "invitation" | "password_reset";
    to: string;
    subject: string;
    html: string;
    text: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{
  id: string;
  status: EmailDeliveryStatus;
  provider: string;
  providerMessageId?: string;
}> {
  const config = runtimeConfig(env);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const provider = config.APP_ENV === "local" ? "local" : "cloudflare_email";
  const message: EmailMessage = {
    to: input.to,
    from: {
      email: config.MAIL_FROM ?? "noreply@example.com",
      name: appName(env),
    },
    subject: input.subject,
    html: input.html,
    text: input.text,
  };

  let status: EmailDeliveryStatus = "stored";
  let providerMessageId: string | undefined;
  let errorMessage: string | null = null;
  let sentAt: string | null = null;

  if (config.APP_ENV !== "local") {
    try {
      const result: unknown = await env.EMAIL.send({
        to: message.to,
        from: message.from.email,
        subject: message.subject,
        ...(message.text ? { text: message.text } : {}),
        ...(message.html ? { html: message.html } : {}),
      });
      status = "sent";
      providerMessageId = providerMessageIdFrom(result);
      sentAt = new Date().toISOString();
    } catch (error) {
      status = "failed";
      errorMessage = error instanceof Error ? error.message : "Email delivery failed.";
    }
  }

  await env.DB.prepare(
    `
      INSERT INTO email_messages (
        id,
        kind,
        recipient_email,
        subject,
        status,
        provider,
        provider_message_id,
        error_message,
        metadata_json,
        created_at,
        sent_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      id,
      input.kind,
      input.to,
      input.subject,
      status,
      provider,
      providerMessageId ?? null,
      errorMessage,
      JSON.stringify(input.metadata ?? {}),
      now,
      sentAt,
    )
    .run();

  return {
    id,
    status,
    provider,
    ...(providerMessageId ? { providerMessageId } : {}),
  };
}

function providerMessageIdFrom(result: unknown): string | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const candidate = "id" in result ? result.id : undefined;
  return typeof candidate === "string" ? candidate : undefined;
}
