import * as v from "valibot";

export const EmailSchema = v.pipe(v.string(), v.email());
export const authPasswordPolicy = {
  minLength: 12,
} as const;
export const minimumPasswordLength = authPasswordPolicy.minLength;
export const PasswordSchema = v.pipe(
  v.string(),
  v.minLength(
    minimumPasswordLength,
    `Password must be at least ${minimumPasswordLength} characters.`,
  ),
);

export const InviteStatusSchema = v.picklist(["pending", "accepted", "expired", "revoked"]);
export const PasswordResetStatusSchema = v.picklist(["pending", "used", "expired", "revoked"]);

export const UserSchema = v.object({
  id: v.string(),
  email: EmailSchema,
  role: v.string(),
  displayName: v.optional(v.string()),
  createdAt: v.string(),
});

export const InvitationSchema = v.object({
  id: v.string(),
  email: EmailSchema,
  role: v.string(),
  status: InviteStatusSchema,
  tokenHash: v.string(),
  expiresAt: v.string(),
  createdBy: v.string(),
  createdAt: v.string(),
  acceptedAt: v.optional(v.string()),
  revokedAt: v.optional(v.string()),
});

export const PasswordCredentialSchema = v.object({
  userId: v.string(),
  passwordHash: v.string(),
  updatedAt: v.string(),
});

export const PasswordResetTokenSchema = v.object({
  id: v.string(),
  userId: v.string(),
  email: EmailSchema,
  tokenHash: v.string(),
  status: PasswordResetStatusSchema,
  expiresAt: v.string(),
  createdAt: v.string(),
  usedAt: v.optional(v.string()),
  revokedAt: v.optional(v.string()),
});

export const SessionSchema = v.object({
  id: v.string(),
  userId: v.string(),
  tokenHash: v.string(),
  expiresAt: v.string(),
  absoluteExpiresAt: v.string(),
  createdAt: v.string(),
  lastSeenAt: v.string(),
  revokedAt: v.optional(v.string()),
});

export const CreateInvitationInputSchema = v.object({
  email: EmailSchema,
  role: v.optional(v.string()),
});

export const AcceptInvitationInputSchema = v.object({
  displayName: v.optional(v.string()),
  password: PasswordSchema,
});

export const LoginInputSchema = v.object({
  email: EmailSchema,
  password: v.string(),
});

export const RequestPasswordResetInputSchema = v.object({
  email: EmailSchema,
});

export const ConfirmPasswordResetInputSchema = v.object({
  token: v.string(),
  password: PasswordSchema,
});

export type User = v.InferOutput<typeof UserSchema>;
export type InviteStatus = v.InferOutput<typeof InviteStatusSchema>;
export type PasswordResetStatus = v.InferOutput<typeof PasswordResetStatusSchema>;
export type Invitation = v.InferOutput<typeof InvitationSchema>;
export type PasswordCredential = v.InferOutput<typeof PasswordCredentialSchema>;
export type PasswordResetToken = v.InferOutput<typeof PasswordResetTokenSchema>;
export type Session = v.InferOutput<typeof SessionSchema>;
export type CreateInvitationInput = v.InferOutput<typeof CreateInvitationInputSchema>;
export type AcceptInvitationInput = v.InferOutput<typeof AcceptInvitationInputSchema>;
export type LoginInput = v.InferOutput<typeof LoginInputSchema>;
export type RequestPasswordResetInput = v.InferOutput<typeof RequestPasswordResetInputSchema>;
export type ConfirmPasswordResetInput = v.InferOutput<typeof ConfirmPasswordResetInputSchema>;

export type InvitationWithToken = {
  invitation: Invitation;
  token: string;
};

export type SessionWithToken = {
  session: Session;
  token: string;
};

export type PasswordResetWithToken = {
  passwordResetToken: PasswordResetToken;
  token: string;
};

export type PasswordHashOptions = {
  iterations?: number;
  saltByteLength?: number;
};

const passwordHashAlgorithm = "pbkdf2-sha256";
const defaultPasswordIterations = 210_000;
const defaultSaltByteLength = 16;
const defaultTokenByteLength = 32;
const sessionRollingDays = 7;
const sessionAbsoluteDays = 30;
const passwordResetMinutes = 30;

const textEncoder = new TextEncoder();

export function createInviteExpiry(now = new Date(), days = 1): string {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt.toISOString();
}

export function createPasswordResetExpiry(
  now = new Date(),
  minutes = passwordResetMinutes,
): string {
  const expiresAt = new Date(now);
  expiresAt.setMinutes(expiresAt.getMinutes() + minutes);
  return expiresAt.toISOString();
}

export function createRollingSessionExpiry(now = new Date(), days = sessionRollingDays): string {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt.toISOString();
}

export function createAbsoluteSessionExpiry(now = new Date(), days = sessionAbsoluteDays): string {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt.toISOString();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isExpired(expiresAt: string, now = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function generateToken(byteLength = defaultTokenByteLength): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(secret));
  return `sha256.${base64UrlEncode(new Uint8Array(digest))}`;
}

export async function createInvitation(input: {
  email: string;
  role: string;
  createdBy: string;
  now?: Date;
  expiresAt?: string;
}): Promise<InvitationWithToken> {
  const now = input.now ?? new Date();
  const token = generateToken();
  const invitation: Invitation = {
    id: crypto.randomUUID(),
    email: normalizeEmail(input.email),
    role: input.role,
    status: "pending",
    tokenHash: await hashSecret(token),
    expiresAt: input.expiresAt ?? createInviteExpiry(now),
    createdBy: input.createdBy,
    createdAt: now.toISOString(),
  };

  return {
    invitation,
    token,
  };
}

export async function createSession(input: {
  userId: string;
  now?: Date;
}): Promise<SessionWithToken> {
  const now = input.now ?? new Date();
  const token = generateToken();
  const session: Session = {
    id: crypto.randomUUID(),
    userId: input.userId,
    tokenHash: await hashSecret(token),
    expiresAt: createRollingSessionExpiry(now),
    absoluteExpiresAt: createAbsoluteSessionExpiry(now),
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
  };

  return {
    session,
    token,
  };
}

export async function createPasswordResetToken(input: {
  userId: string;
  email: string;
  now?: Date;
  expiresAt?: string;
}): Promise<PasswordResetWithToken> {
  const now = input.now ?? new Date();
  const token = generateToken();
  const passwordResetToken: PasswordResetToken = {
    id: crypto.randomUUID(),
    userId: input.userId,
    email: normalizeEmail(input.email),
    tokenHash: await hashSecret(token),
    status: "pending",
    expiresAt: input.expiresAt ?? createPasswordResetExpiry(now),
    createdAt: now.toISOString(),
  };

  return {
    passwordResetToken,
    token,
  };
}

export async function hashPassword(
  password: string,
  options: PasswordHashOptions = {},
): Promise<string> {
  const iterations = options.iterations ?? defaultPasswordIterations;
  const salt: Uint8Array<ArrayBuffer> = new Uint8Array(
    options.saltByteLength ?? defaultSaltByteLength,
  );
  crypto.getRandomValues(salt);

  const digest = await derivePasswordDigest(password, salt, iterations);
  return [
    passwordHashAlgorithm,
    String(iterations),
    base64UrlEncode(salt),
    base64UrlEncode(digest),
  ].join("$");
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 4) return false;

  const [algorithm, iterationsText, saltText, digestText] = parts;
  if (algorithm !== passwordHashAlgorithm) return false;

  const iterations = Number.parseInt(iterationsText ?? "", 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const salt = base64UrlDecode(saltText ?? "");
  const expectedDigest = base64UrlDecode(digestText ?? "");
  const actualDigest = await derivePasswordDigest(password, salt, iterations);

  return constantTimeEqual(actualDigest, expectedDigest);
}

async function derivePasswordDigest(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    key,
    256,
  );

  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;

  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return difference === 0;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
