import {
  createTranslator,
  defineMessages,
  isKnownLocale,
  type Dictionary,
  type LocaleMetadata,
} from "@qitu/i18n";
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
export const InboundEmailAttachmentSchema = v.object({
  contentType: v.string(),
  filename: v.string(),
  objectKey: v.string(),
  size: v.number(),
  sourceFileId: v.optional(v.string()),
});
export const InboundEmailReceiptSchema = v.object({
  attachmentCount: v.number(),
  from: v.string(),
  id: v.string(),
  rawObjectKey: v.string(),
  receivedAt: v.string(),
  subject: v.optional(v.string()),
  to: v.string(),
});

export type EmailMessage = v.InferOutput<typeof EmailMessageSchema>;
export type EmailAddress = v.InferOutput<typeof EmailAddressSchema>;
export type EmailDeliveryStatus = v.InferOutput<typeof EmailDeliveryStatusSchema>;
export type InboundEmailAttachment = v.InferOutput<typeof InboundEmailAttachmentSchema>;
export type InboundEmailReceipt = v.InferOutput<typeof InboundEmailReceiptSchema>;

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
  locale?: string | undefined;
  url: string;
};

export const emailLocaleOptions = [
  {
    id: "en",
    label: "English",
    shortLabel: "EN",
    htmlLang: "en",
    intlLocale: "en-GB",
  },
  {
    id: "zh-CN",
    label: "简体中文",
    shortLabel: "中",
    htmlLang: "zh-CN",
    intlLocale: "zh-CN",
  },
] as const satisfies readonly LocaleMetadata<string>[];

export type EmailLocale = (typeof emailLocaleOptions)[number]["id"];

const defaultEmailLocale: EmailLocale = "en";

const enAuthEmailMessages = defineMessages({
  "invitation.htmlAction": "Create your account",
  "invitation.htmlIgnore": "If you did not expect this invitation, you can ignore this email.",
  "invitation.htmlIntro": "You have been invited to {appName}.",
  "invitation.subject": "Join {appName}",
  "invitation.textAction": "Open this link to create your account:",
  "invitation.textIgnore": "If you did not expect this invitation, you can ignore this email.",
  "invitation.textIntro": "You have been invited to {appName}.",
  "passwordReset.htmlAction": "Set a new password",
  "passwordReset.htmlIgnore":
    "This link expires soon. If you did not request it, you can ignore this email.",
  "passwordReset.htmlIntro": "A password reset was requested for {appName}.",
  "passwordReset.subject": "Reset your {appName} password",
  "passwordReset.textAction": "Open this link to set a new password:",
  "passwordReset.textIgnore":
    "This link expires soon. If you did not request it, you can ignore this email.",
  "passwordReset.textIntro": "A password reset was requested for {appName}.",
});

type AuthEmailMessageKey = keyof typeof enAuthEmailMessages;

const zhCnAuthEmailMessages: Record<AuthEmailMessageKey, string> = {
  "invitation.htmlAction": "创建账户",
  "invitation.htmlIgnore": "如果你没有预期收到这封邀请，可以忽略此邮件。",
  "invitation.htmlIntro": "你已被邀请加入 {appName}。",
  "invitation.subject": "加入 {appName}",
  "invitation.textAction": "打开此链接创建你的账户：",
  "invitation.textIgnore": "如果你没有预期收到这封邀请，可以忽略此邮件。",
  "invitation.textIntro": "你已被邀请加入 {appName}。",
  "passwordReset.htmlAction": "设置新密码",
  "passwordReset.htmlIgnore": "此链接会很快过期。如果不是你本人请求，可以忽略此邮件。",
  "passwordReset.htmlIntro": "{appName} 收到了密码重置请求。",
  "passwordReset.subject": "重置你的 {appName} 密码",
  "passwordReset.textAction": "打开此链接设置新密码：",
  "passwordReset.textIgnore": "此链接会很快过期。如果不是你本人请求，可以忽略此邮件。",
  "passwordReset.textIntro": "{appName} 收到了密码重置请求。",
};

const authEmailMessages: Record<EmailLocale, Dictionary<AuthEmailMessageKey>> = {
  en: enAuthEmailMessages,
  "zh-CN": zhCnAuthEmailMessages,
};

export function renderInvitationEmail(input: AuthEmailTemplateInput): {
  subject: string;
  text: string;
  html: string;
} {
  const t = createAuthEmailTranslator(input.locale);
  const subject = t("invitation.subject", { appName: input.appName });
  const escapedUrl = escapeHtml(input.url);
  const escapedAppName = escapeHtml(input.appName);

  return {
    subject,
    text: [
      t("invitation.textIntro", { appName: input.appName }),
      "",
      t("invitation.textAction"),
      input.url,
      "",
      t("invitation.textIgnore"),
    ].join("\n"),
    html: [
      `<p>${t("invitation.htmlIntro", { appName: escapedAppName })}</p>`,
      `<p><a href="${escapedUrl}">${t("invitation.htmlAction")}</a></p>`,
      `<p>${t("invitation.htmlIgnore")}</p>`,
    ].join(""),
  };
}

export function renderPasswordResetEmail(input: AuthEmailTemplateInput): {
  subject: string;
  text: string;
  html: string;
} {
  const t = createAuthEmailTranslator(input.locale);
  const subject = t("passwordReset.subject", { appName: input.appName });
  const escapedUrl = escapeHtml(input.url);
  const escapedAppName = escapeHtml(input.appName);

  return {
    subject,
    text: [
      t("passwordReset.textIntro", { appName: input.appName }),
      "",
      t("passwordReset.textAction"),
      input.url,
      "",
      t("passwordReset.textIgnore"),
    ].join("\n"),
    html: [
      `<p>${t("passwordReset.htmlIntro", { appName: escapedAppName })}</p>`,
      `<p><a href="${escapedUrl}">${t("passwordReset.htmlAction")}</a></p>`,
      `<p>${t("passwordReset.htmlIgnore")}</p>`,
    ].join(""),
  };
}

function createAuthEmailTranslator(locale: string | undefined) {
  const resolvedLocale = isKnownLocale(locale, emailLocaleOptions) ? locale : defaultEmailLocale;

  return createTranslator({
    defaultLocale: defaultEmailLocale,
    dictionaries: authEmailMessages,
    locale: resolvedLocale,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
