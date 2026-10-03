// App-level errors shown to users: a stable code plus a message key, never raw error text.
export type AppErrorCode = "db" | "closed" | "mapper" | "unknown"

export interface AppError {
  code: AppErrorCode
  /** what the UI says ("Couldn't load this. Try again."); the cause goes to the logger */
  message: string
  cause?: unknown
}

export function toAppError(error: unknown): AppError {
  const name = error instanceof Error ? error.name : ""
  if (name === "DatabaseClosedError")
    return {
      code: "closed",
      message: "VScout was updated in another tab. Reload to continue.",
      cause: error,
    }
  if (name.endsWith("Error") && name !== "Error" && name !== "TypeError")
    return {
      code: "db",
      message: "Couldn't read data on this device. Try again.",
      cause: error,
    }
  return {
    code: "unknown",
    message: "Something went wrong. Try again.",
    cause: error,
  }
}
