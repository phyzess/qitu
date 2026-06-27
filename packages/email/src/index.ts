import * as v from "valibot";

export const EmailAddressSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  name: v.optional(v.string()),
});

export const EmailMessageSchema = v.object({
  to: v.pipe(v.string(), v.email()),
  from: EmailAddressSchema,
  subject: v.string(),
  html: v.optional(v.string()),
  text: v.optional(v.string()),
});

export const EmailDeliveryStatusSchema = v.picklist(["sent", "stored", "failed"]);

export type EmailMessage = v.InferOutput<typeof EmailMessageSchema>;
export type EmailAddress = v.InferOutput<typeof EmailAddressSchema>;
export type EmailDeliveryStatus = v.InferOutput<typeof EmailDeliveryStatusSchema>;

export type EmailDeliveryResult = {
  providerMessageId?: string;
  status: EmailDeliveryStatus;
};

export type EmailSender = {
  send(message: EmailMessage): Promise<EmailDeliveryResult>;
};

export type AuthEmailTemplateInput = {
  appName: string;
  email: string;
  url: string;
};

export function renderInvitationEmail(input: AuthEmailTemplateInput): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `Join ${input.appName}`;
  const escapedUrl = escapeHtml(input.url);
  const escapedAppName = escapeHtml(input.appName);

  return {
    subject,
    text: [
      `You have been invited to ${input.appName}.`,
      "",
      "Open this link to create your account:",
      input.url,
      "",
      "If you did not expect this invitation, you can ignore this email.",
    ].join("\n"),
    html: [
      `<p>You have been invited to ${escapedAppName}.</p>`,
      `<p><a href="${escapedUrl}">Create your account</a></p>`,
      "<p>If you did not expect this invitation, you can ignore this email.</p>",
    ].join(""),
  };
}

export function renderPasswordResetEmail(input: AuthEmailTemplateInput): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `Reset your ${input.appName} password`;
  const escapedUrl = escapeHtml(input.url);
  const escapedAppName = escapeHtml(input.appName);

  return {
    subject,
    text: [
      `A password reset was requested for ${input.appName}.`,
      "",
      "Open this link to set a new password:",
      input.url,
      "",
      "This link expires soon. If you did not request it, you can ignore this email.",
    ].join("\n"),
    html: [
      `<p>A password reset was requested for ${escapedAppName}.</p>`,
      `<p><a href="${escapedUrl}">Set a new password</a></p>`,
      "<p>This link expires soon. If you did not request it, you can ignore this email.</p>",
    ].join(""),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
