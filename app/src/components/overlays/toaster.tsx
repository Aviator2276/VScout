// Toasts on Base UI Toast (live regions, swipe to dismiss, an action button). Glass chrome above the
// tab bar. Undo after delete (ADR-029) and sync messages use it.
import { Toast } from "@base-ui/react/toast"
import type { ReactNode } from "react"
import { X } from "@/components/icons/icon"

export interface ToastOptions {
  title: string
  description?: string
  /** e.g. { label: "Undo", onAction } */
  action?: { label: string; onAction: () => void }
  /** high = announced assertively (errors, urgent) */
  priority?: "low" | "high"
  /** ms; 0 keeps it until dismissed */
  timeout?: number
}

export function useToast() {
  const manager = Toast.useToastManager()
  return {
    show(opts: ToastOptions): string {
      return manager.add({
        title: opts.title,
        ...(opts.description ? { description: opts.description } : {}),
        priority: opts.priority ?? "low",
        timeout: opts.timeout ?? 5000,
        ...(opts.action
          ? {
              actionProps: {
                children: opts.action.label,
                onClick: opts.action.onAction,
              },
            }
          : {}),
      })
    },
    dismiss: (id?: string) => manager.close(id),
  }
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((t) => (
    <Toast.Root
      key={t.id}
      toast={t}
      className="flex w-full items-center gap-3 rounded-2xl glass px-4 py-3 text-foreground data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0"
    >
      <div className="min-w-0 flex-1">
        <Toast.Title className="text-subhead font-semibold" />
        <Toast.Description className="text-footnote" />
      </div>
      {t.actionProps ? (
        <Toast.Action className="min-h-11 px-2 text-subhead font-semibold text-primary" />
      ) : null}
      <Toast.Close
        aria-label="Dismiss"
        className="hit-44 flex min-h-11 min-w-11 items-center justify-center text-muted-foreground"
      >
        <X aria-hidden size={18} />
      </Toast.Close>
    </Toast.Root>
  ))
}

/** Mount once at the app root; components call useToast(). */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed inset-x-0 bottom-[calc(var(--k-safe-area-bottom,0px)+96px)] z-[60] mx-auto flex w-[min(100%-2rem,28rem)] flex-col gap-2">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
