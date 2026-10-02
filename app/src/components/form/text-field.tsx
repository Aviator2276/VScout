// Labelled text inputs with description and error wired for screen readers (shadcn Field on Base
// UI). Used with TanStack Form: pass value, onChange and the field's error messages.
import { useId } from "react"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

interface BaseProps {
  label: string
  value: string
  onValueChange: (value: string) => void
  description?: string
  /** validation messages to show; empty or absent = valid */
  errors?: ReadonlyArray<string>
  placeholder?: string
  disabled?: boolean
  onBlur?: () => void
}

export interface TextFieldProps extends BaseProps {
  type?: "text" | "password" | "email" | "search" | "number"
  autoComplete?: string
  inputMode?: "text" | "numeric" | "decimal" | "search" | "email"
  /** never autofocus on phones (it pops the keyboard); the caller decides */
  autoFocus?: boolean
  maxLength?: number
  autoCapitalize?: "off" | "none" | "sentences" | "words" | "characters"
  autoCorrect?: "on" | "off"
  spellCheck?: boolean
  enterKeyHint?: "go" | "next" | "done" | "search" | "send"
  /** "code": large monospaced digits with wide tracking (guest code, ui-patterns §9B) */
  variant?: "default" | "code"
}

function useIds(
  errors: ReadonlyArray<string> | undefined,
  description: string | undefined
) {
  const id = useId()
  const descId = `${id}-desc`
  const errId = `${id}-err`
  const invalid = (errors?.length ?? 0) > 0
  const describedBy =
    [description ? descId : null, invalid ? errId : null]
      .filter(Boolean)
      .join(" ") || undefined
  return { id, descId, errId, invalid, describedBy }
}

function Messages({
  ids,
  description,
  errors,
}: {
  ids: ReturnType<typeof useIds>
  description?: string | undefined
  errors?: ReadonlyArray<string> | undefined
}) {
  return (
    <>
      {description ? (
        <FieldDescription id={ids.descId}>{description}</FieldDescription>
      ) : null}
      {ids.invalid ? (
        <FieldError
          id={ids.errId}
          errors={(errors ?? []).map((message) => ({ message }))}
        />
      ) : null}
    </>
  )
}

export function TextField({
  label,
  value,
  onValueChange,
  description,
  errors,
  type = "text",
  variant = "default",
  ...rest
}: TextFieldProps) {
  const ids = useIds(errors, description)
  return (
    <Field data-invalid={ids.invalid || undefined}>
      <FieldLabel htmlFor={ids.id}>{label}</FieldLabel>
      <Input
        id={ids.id}
        type={type}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        aria-invalid={ids.invalid || undefined}
        aria-describedby={ids.describedBy}
        className={
          variant === "code"
            ? "min-h-14 font-mono text-title-2 tracking-[0.3em] tabular-nums"
            : "min-h-11 text-body"
        }
        {...rest}
      />
      <Messages ids={ids} description={description} errors={errors} />
    </Field>
  )
}

export interface TextAreaProps extends BaseProps {
  rows?: number
  maxLength?: number
}

export function TextArea({
  label,
  value,
  onValueChange,
  description,
  errors,
  rows = 4,
  ...rest
}: TextAreaProps) {
  const ids = useIds(errors, description)
  return (
    <Field data-invalid={ids.invalid || undefined}>
      <FieldLabel htmlFor={ids.id}>{label}</FieldLabel>
      <Textarea
        id={ids.id}
        value={value}
        rows={rows}
        onChange={(e) => onValueChange(e.target.value)}
        aria-invalid={ids.invalid || undefined}
        aria-describedby={ids.describedBy}
        className="text-body"
        {...rest}
      />
      <Messages ids={ids} description={description} errors={errors} />
    </Field>
  )
}
