export function assertAuthAndDbInterfaces({ assert, auth, db }) {
  assert(
    auth.minimumPasswordLength === 12 &&
      auth.authPasswordPolicy.minLength === auth.minimumPasswordLength,
    "auth package must expose shared password policy constants.",
  );
  assert(
    typeof db.users.role === "object" &&
      typeof db.passwordResetTokens.tokenHash === "object" &&
      typeof db.emailMessages.providerMessageId === "object" &&
      typeof db.inboundEmailMessages.rawObjectKey === "object" &&
      typeof db.inboundEmailAttachments.sourceFileId === "object" &&
      typeof db.sourceFiles.deletedAt === "object" &&
      typeof db.sourceFiles.deletedBy === "object" &&
      typeof db.sourceFiles.deletionStartedAt === "object" &&
      typeof db.sourceFiles.deletionStartedBy === "object" &&
      typeof db.sourceFiles.deletionFailureStage === "object" &&
      typeof db.sourceFiles.deletionFailureReason === "object" &&
      typeof db.importJobs.processingOwner === "object" &&
      typeof db.importJobs.processingLeaseExpiresAt === "object" &&
      typeof db.importJobs.mutationToken === "object" &&
      typeof db.importJobs.mutationStartedAt === "object" &&
      typeof db.importJobs.mutationKind === "object" &&
      typeof db.importJobs.mutationPreviousStatus === "object",
    "db package must expose the current auth, email, source lifecycle, and import lease migration baseline.",
  );
}
