import { type EmailDeliveryStatus, type EmailMessage } from "@qitu/email";
import { appName, emailDeliveryMode, runtimeConfig } from "./runtime";

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
  errorMessage?: string;
  id: string;
  mode: "store" | "send";
  status: EmailDeliveryStatus;
  provider: string;
  providerMessageId?: string;
  sentAt?: string;
}> {
  const config = runtimeConfig(env);
  const mode = emailDeliveryMode(env);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const provider = mode === "send" ? "cloudflare_email" : "store";
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

  if (mode === "send") {
    try {
      const configError = validateSendConfig(config.MAIL_FROM);
      if (configError) {
        throw new Error(configError);
      }

      const result: unknown = await env.EMAIL.send({
        to: message.to,
        from: {
          email: message.from.email,
          name: message.from.name ?? appName(env),
        },
        subject: message.subject,
        ...(config.MAIL_REPLY_TO ? { replyTo: config.MAIL_REPLY_TO } : {}),
        ...(message.text ? { text: message.text } : {}),
        ...(message.html ? { html: message.html } : {}),
      });
      status = "sent";
      providerMessageId = providerMessageIdFrom(result);
      sentAt = new Date().toISOString();
    } catch (error) {
      status = "failed";
      errorMessage = deliveryErrorMessage(error);
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
    mode,
    ...(errorMessage ? { errorMessage } : {}),
    ...(providerMessageId ? { providerMessageId } : {}),
    ...(sentAt ? { sentAt } : {}),
  };
}

function providerMessageIdFrom(result: unknown): string | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const candidate =
    "messageId" in result ? result.messageId : "id" in result ? result.id : undefined;
  return typeof candidate === "string" ? candidate : undefined;
}

function validateSendConfig(mailFrom: string | undefined): string | null {
  if (!mailFrom) {
    return "MAIL_FROM is required when EMAIL_DELIVERY_MODE=send.";
  }

  const domain = mailFrom.split("@")[1]?.toLowerCase();
  if (!domain) {
    return "MAIL_FROM must include a sending domain.";
  }

  if (domain === "example.com" || domain.endsWith(".example.com")) {
    return "MAIL_FROM must be replaced with a verified Cloudflare Email sender.";
  }

  return null;
}

function deliveryErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Email delivery failed.";
  }

  const maybeCode = (error as { code?: unknown }).code;
  return typeof maybeCode === "string" ? `${maybeCode}: ${error.message}` : error.message;
}
