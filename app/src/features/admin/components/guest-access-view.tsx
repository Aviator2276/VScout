// Settings → Admin → Guest Access (features/admin.md AD3b, ADR-066/073). Every change is online
// only and signs guests out when the code changes or access is turned off, so each one asks first.
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { List } from "@/components/list/list"
import { ConfirmAlert } from "@/components/overlays/confirm-alert"
import type { EventSettingsRecord } from "@/lib/db/types"

type Pending = "on" | "off" | "rotate" | null

export interface GuestAccessViewProps {
  settings: EventSettingsRecord
  online: boolean
  supported: boolean
  /** signed-in guests, when the server reports it */
  guestCount?: number
  relative: (at: number) => string
  onSave: (next: {
    enabled: boolean
    newCode: boolean
  }) => Promise<{ ok: boolean }>
  onCopy: (code: string) => void
  onShare?: (code: string) => void
}

const WARNING =
  "Anyone who has the app link and this code can read this event’s scouting data, picklists and comments. Guests can’t see chat or direct messages."

export function GuestAccessView(p: GuestAccessViewProps) {
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const g = p.settings.guestAccess
  const devices = p.guestCount === undefined ? "all" : String(p.guestCount)
  if (!p.supported)
    return (
      <p className="py-10 text-center text-muted-foreground">
        This server doesn’t support guest access.
      </p>
    )

  const save = async (next: { enabled: boolean; newCode: boolean }) => {
    setPending(null)
    setBusy(true)
    const r = await p.onSave(next)
    setBusy(false)
    setError(!r.ok)
  }

  return (
    <>
      {p.online ? null : (
        <p
          role="status"
          className="mt-2 rounded-xl bg-muted px-3 py-2 text-footnote"
        >
          Needs connection. Guest access can only change online.
        </p>
      )}
      <List.Section footer={g.enabled ? undefined : WARNING}>
        <List.Toggle
          title="Allow guests at this event"
          checked={g.enabled}
          disabled={!p.online || busy}
          onCheckedChange={(on) => setPending(on ? "on" : "off")}
        />
      </List.Section>
      {g.enabled && g.code ? (
        <List.Section title="Guest code" footer={WARNING}>
          <li className="flex flex-col gap-2 px-4 py-3">
            <span
              aria-label={`Guest code ${g.code.split("").join(" ")}`}
              className="font-heading text-large-title tracking-[0.3em]"
            >
              {g.code}
            </span>
            {g.rotatedAt ? (
              <span className="text-footnote text-muted-foreground">
                Changed {p.relative(g.rotatedAt)}
              </span>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => p.onCopy(g.code ?? "")}
              >
                Copy
              </Button>
              {p.onShare ? (
                <Button
                  variant="secondary"
                  onClick={() => p.onShare?.(g.code ?? "")}
                >
                  Share
                </Button>
              ) : null}
            </div>
          </li>
          <List.Row
            title={<span className="text-destructive">Generate New Code</span>}
            {...(p.online && !busy
              ? { onSelect: () => setPending("rotate") }
              : { detail: "Needs connection" })}
          />
          {p.guestCount === undefined ? null : (
            <List.Row title="Guests signed in" detail={String(p.guestCount)} />
          )}
        </List.Section>
      ) : null}
      {error ? (
        <p role="alert" className="px-4 text-footnote text-destructive">
          Couldn’t change guest access. Try again.
        </p>
      ) : null}
      <ConfirmAlert
        open={pending === "on"}
        onOpenChange={(o) => (o ? undefined : setPending(null))}
        title="Allow Guests?"
        description={WARNING}
        confirmLabel="Allow Guests"
        onConfirm={() => void save({ enabled: true, newCode: !g.code })}
      />
      <ConfirmAlert
        open={pending === "off"}
        onOpenChange={(o) => (o ? undefined : setPending(null))}
        title="Sign Out All Guests?"
        description={`Guests on ${devices} devices will be signed out.`}
        confirmLabel="Turn Off"
        tone="destructive"
        onConfirm={() => void save({ enabled: false, newCode: false })}
      />
      <ConfirmAlert
        open={pending === "rotate"}
        onOpenChange={(o) => (o ? undefined : setPending(null))}
        title="Make a New Code?"
        description={`Guests on ${devices} devices will be signed out, and the old code stops working.`}
        confirmLabel="New Code"
        tone="destructive"
        onConfirm={() => void save({ enabled: true, newCode: true })}
      />
    </>
  )
}
