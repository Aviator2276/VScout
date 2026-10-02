import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { TextArea, TextField } from "../form/text-field"
import { ActionSheet } from "../overlays/action-sheet"
import { ConfirmAlert } from "../overlays/confirm-alert"
import { Sheet } from "../overlays/sheet"
import { ToastProvider, useToast } from "../overlays/toaster"
import {
  ConflictBadge,
  RefreshingIndicator,
  StaleNote,
  SyncBadge,
  formatAgo,
} from "../sync/sync-badge"

describe("Sheet", () => {
  function Harness({ closeLabel }: { closeLabel?: "Done" | "Close" }) {
    const [open, setOpen] = useState(true)
    return (
      <>
        <p>{open ? "open" : "closed"}</p>
        <Sheet open={open} onOpenChange={setOpen}>
          <Sheet.Content
            title="Edit Widget"
            description="Clock"
            {...(closeLabel ? { closeLabel } : {})}
          >
            <p>Body</p>
          </Sheet.Content>
        </Sheet>
      </>
    )
  }

  it("is a labelled dialog with a visible close button", async () => {
    render(<Harness />)
    const dialog = await screen.findByRole("dialog", { name: "Edit Widget" })
    expect(dialog).toHaveTextContent("Body")
    await userEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.getByText("closed")).toBeInTheDocument())
  })

  it("closes on Escape and offers Done for editing sheets", async () => {
    render(<Harness closeLabel="Done" />)
    expect(
      await screen.findByRole("button", { name: "Done" })
    ).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.getByText("closed")).toBeInTheDocument())
  })
})

describe("ActionSheet and ConfirmAlert", () => {
  it("runs the chosen action and closes", async () => {
    const onDelete = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ActionSheet
        open
        onOpenChange={onOpenChange}
        title="Delete this entry?"
        actions={[
          { label: "Delete Entry", destructive: true, onSelect: onDelete },
        ]}
      />
    )
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete Entry" })
    )
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument()
  })

  it("is an alertdialog that confirms with the action verb", async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmAlert
        open
        onOpenChange={() => undefined}
        title="Log out?"
        description="3 changes haven't synced."
        confirmLabel="Log Out"
        tone="destructive"
        onConfirm={onConfirm}
      />
    )
    expect(
      await screen.findByRole("alertdialog", { name: "Log out?" })
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Log Out" }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})

describe("Toasts", () => {
  it("shows a toast with an Undo action", async () => {
    const onUndo = vi.fn()
    function Trigger() {
      const toast = useToast()
      return (
        <button
          type="button"
          onClick={() =>
            toast.show({
              title: "Entry deleted",
              action: { label: "Undo", onAction: onUndo },
            })
          }
        >
          Delete
        </button>
      )
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    )
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(await screen.findByText("Entry deleted")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(onUndo).toHaveBeenCalledOnce()
  })
})

describe("TextField", () => {
  it("labels the input and wires the description and error", () => {
    render(
      <TextField
        label="Username"
        value=""
        onValueChange={() => undefined}
        description="Ask your admin"
        errors={["Enter your username"]}
      />
    )
    const input = screen.getByLabelText("Username")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription(
      /Ask your admin.*Enter your username/
    )
  })

  it("passes typing through, for text areas too", async () => {
    const onChange = vi.fn()
    render(<TextArea label="Notes" value="" onValueChange={onChange} />)
    await userEvent.type(screen.getByLabelText("Notes"), "a")
    expect(onChange).toHaveBeenCalledWith("a")
  })
})

describe("sync overlays", () => {
  it.each([
    ["pending", "Waiting to sync"],
    ["conflict", "Needs review"],
    ["rejected", "Not saved"],
  ] as const)("%s shows %s", (state, text) => {
    render(<SyncBadge state={state} />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it("synced shows nothing; stale and refreshing are announced", async () => {
    const { container } = render(<SyncBadge state="synced" />)
    expect(container).toBeEmptyDOMElement()
    render(<StaleNote updatedAt={0} offline now={4 * 60_000} />)
    expect(screen.getByRole("status")).toHaveTextContent(
      "Offline · updated 4 min ago"
    )
    render(<RefreshingIndicator />)
    const onResolve = vi.fn()
    render(<ConflictBadge onResolve={onResolve} />)
    await userEvent.click(
      screen.getByRole("button", { name: "Review changes" })
    )
    expect(onResolve).toHaveBeenCalledOnce()
  })

  it("formats ages", () => {
    expect([
      formatAgo(10_000),
      formatAgo(5 * 60_000),
      formatAgo(3 * 3_600_000),
      formatAgo(26 * 3_600_000),
      formatAgo(72 * 3_600_000),
    ]).toEqual(["just now", "5 min ago", "3 h ago", "yesterday", "3 days ago"])
  })
})
