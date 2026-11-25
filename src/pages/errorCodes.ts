export type ApplicationErrorCode =
  | "unexpected"
  | "auth_provider_rejected"
  | "invalid_callback"
  | "auth_failed";

export const applicationErrorMessages: Record<ApplicationErrorCode, string> = {
  unexpected: "An unexpected error occurred.",
  auth_provider_rejected: "The identity provider rejected the sign-in request.",
  invalid_callback: "The sign-in callback was missing required information.",
  auth_failed: "Authentication failed. Please try signing in again.",
};

export const isApplicationErrorCode = (value: unknown): value is ApplicationErrorCode =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(applicationErrorMessages, value);
