// A centered alert that interrupts: use only when a choice can't be undone (deletes are usually
// Undo toasts instead, ADR-029). role="alertdialog", focus managed by Base UI.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export interface ConfirmAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** the action verb, e.g. "Log Out" (never "OK") */
  confirmLabel: string
  cancelLabel?: string
  tone?: "default" | "destructive"
  onConfirm: () => void
}

export function ConfirmAlert({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
}: ConfirmAlertProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            className="min-h-11"
            variant={tone === "destructive" ? "destructive" : "default"}
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
