// What went wrong, then what to do (writing-guidelines). Never the server's raw text.
import type { LoginErrorCode } from "@/lib/auth/auth-client"

export function loginMessage(
  code: LoginErrorCode,
  mode: "account" | "guest"
): string {
  switch (code) {
    case "invalid_credentials":
      return "That username and password don't match. Check them and try again."
    case "invalid_guest_code":
      return "That code didn't work. Check it with your admin."
    case "rate_limited":
      return "Too many tries. Try again in 5 minutes."
    case "offline":
      return mode === "guest"
        ? "You're offline. Connect to sign in as a guest."
        : "You're offline. Connect to sign in."
    case "unknown":
      return "Couldn't sign in. Try again in a moment."
  }
}

/** Shown on /login after a forced logout (routing-auth §7.6). Explicit sign-outs show nothing. */
export function endedMessage(reason: string | undefined): string | null {
  if (!reason) return null
  switch (reason) {
    case "guest_access_disabled":
      return "Guest access was turned off."
    case "guest_code_rotated":
      return "The guest code changed. Ask your team for the new one."
    case "account_disabled":
      return "Your account was turned off. Ask an admin for help."
    case "session_revoked":
      return "You were signed out on this device. Sign in again."
    case "cookie-user-mismatch":
      return "You were signed out because another account signed in. Sign in again."
    default:
      return null
  }
}
