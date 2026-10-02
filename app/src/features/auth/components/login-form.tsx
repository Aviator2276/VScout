// Username and password sign-in (routing-auth §5.4). Sign-in needs the network: offline, the
// button is disabled with the reason as visible text (ui-patterns §6).
import { useState } from "react"
import type { FormEvent } from "react"
import { Button } from "@/components/controls/button"
import { TextField } from "@/components/form/text-field"
import { LoginError } from "@/lib/auth/auth-client"
import { loginMessage } from "../utils/login-messages"

export function LoginForm({
  online,
  defaultUsername = "",
  onSignIn,
}: {
  online: boolean
  defaultUsername?: string
  onSignIn: (username: string, password: string) => Promise<void>
}) {
  const [username, setUsername] = useState(defaultUsername)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = online && username.trim() !== "" && password !== "" && !busy

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await onSignIn(username.trim(), password)
    } catch (err) {
      setError(
        loginMessage(
          err instanceof LoginError ? err.code : "unknown",
          "account"
        )
      )
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <TextField
        label="Username"
        value={username}
        onValueChange={setUsername}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
      />
      <TextField
        label="Password"
        type="password"
        value={password}
        onValueChange={setPassword}
        autoComplete="current-password"
        enterKeyHint="go"
      />
      {error ? (
        <p role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="large" disabled={!ready}>
        {busy ? "Signing In…" : "Sign In"}
      </Button>
      {online ? null : (
        <p className="text-center text-footnote text-muted-foreground">
          Signing in needs a connection.
        </p>
      )}
    </form>
  )
}
