// "Continue as Guest" and the guest code field (ui-patterns §9B, ADR-066/073). One field, not six
// boxes: one tab stop, works with paste and autofill. A pasted full code submits right away.
import { useState } from "react"
import type { FormEvent } from "react"
import { Button } from "@/components/controls/button"
import { TextField } from "@/components/form/text-field"
import { LoginError } from "@/lib/auth/auth-client"
import { isCompleteCode, normalizeGuestCode } from "../utils/guest-code"
import { loginMessage } from "../utils/login-messages"

const HINT = "Ask your team's admin for today's guest code."
const AMBIGUOUS_HINT = "Codes don't use 0, O, 1 or I."

export function GuestLogin({
  online,
  open,
  onOpenChange,
  onJoin,
}: {
  online: boolean
  /** the code field is showing (`?guest=true`, so Back closes it) */
  open: boolean
  onOpenChange: (open: boolean) => void
  onJoin: (code: string) => Promise<void>
}) {
  const [code, setCode] = useState("")
  const [ambiguous, setAmbiguous] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function join(value: string) {
    if (!online || busy || !isCompleteCode(value)) return
    setBusy(true)
    setError(null)
    try {
      await onJoin(value)
    } catch (err) {
      setError(
        loginMessage(err instanceof LoginError ? err.code : "unknown", "guest")
      )
      setBusy(false)
    }
  }

  function change(raw: string) {
    const next = normalizeGuestCode(raw)
    const pasted = raw.length - code.length > 1
    setCode(next.code)
    setAmbiguous(next.ambiguous)
    if (pasted && isCompleteCode(next.code)) void join(next.code)
  }

  if (!open)
    return (
      <Button
        variant="plain"
        size="large"
        disabled={!online}
        onClick={() => onOpenChange(true)}
      >
        Continue as Guest
      </Button>
    )

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        void join(code)
      }}
      className="flex flex-col gap-4"
    >
      <TextField
        label="Guest Code"
        value={code}
        onValueChange={change}
        variant="code"
        placeholder="ABC234"
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="one-time-code"
        enterKeyHint="go"
        description={ambiguous ? AMBIGUOUS_HINT : HINT}
        {...(error ? { errors: [error] } : {})}
      />
      <Button
        type="submit"
        size="large"
        disabled={!online || busy || !isCompleteCode(code)}
      >
        {busy ? "Checking…" : "Join as Guest"}
      </Button>
      <Button variant="plain" onClick={() => onOpenChange(false)}>
        Sign In with an Account
      </Button>
    </form>
  )
}
