// Writing a note (teams.md T2 Notes, ADR-040): text, an optional "Private note" switch (only you
// see it), and Add. Saved through the outbox, so it works offline.
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { Switch } from "@/components/controls/switch"
import { TextArea } from "@/components/form/text-field"

export function NoteComposer({
  label = "Add a note",
  allowPrivate,
  onAdd,
}: {
  label?: string
  allowPrivate: boolean
  onAdd: (note: { body: string; private: boolean }) => Promise<unknown>
}) {
  const [body, setBody] = useState("")
  const [priv, setPriv] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      await onAdd({ body, private: priv })
      setBody("")
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save the note.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <TextArea
        label={label}
        value={body}
        onValueChange={setBody}
        rows={3}
        maxLength={4000}
        errors={error ? [error] : []}
      />
      <div className="flex items-center gap-3">
        {allowPrivate ? (
          <div className="flex items-center gap-2 text-subhead">
            <Switch
              label="Private note"
              checked={priv}
              onCheckedChange={setPriv}
            />
            <span aria-hidden>Private note</span>
          </div>
        ) : null}
        <Button
          type="submit"
          className="ms-auto"
          disabled={busy || !body.trim()}
        >
          Add Note
        </Button>
      </div>
    </form>
  )
}
