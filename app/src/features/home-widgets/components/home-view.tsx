// Home (features/home.md H1–H4): the widget grid, Edit Home, and the Layout control at the very
// bottom. Editing works on an in-memory draft; Done writes one homeLayout patch (ADR-033). The
// Edit Widget sheet does everything the gestures do (size, move, remove), for VoiceOver and keyboard.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Button } from "@/components/controls/button"
import { ResizableGrid } from "@/components/grid/resizable-grid"
import { WidgetCard } from "@/components/grid/widget-card"
import {
  BREAKPOINTS,
  COLUMNS,
  allowedSizes,
  listFor,
  move,
} from "@/components/grid/grid-engine"
import type {
  Breakpoint,
  GridItem,
  Placed,
} from "@/components/grid/grid-engine"
import {
  ArrowUpCircle,
  Check,
  ChevronDown,
  Inbox,
  Lock,
  X,
} from "@/components/icons/icon"
import { List } from "@/components/list/list"
import { ActionSheet } from "@/components/overlays/action-sheet"
import { Sheet } from "@/components/overlays/sheet"
import { useToast } from "@/components/overlays/toaster"
import {
  WIDGETS,
  settingCount,
  settingOn,
  widgetMeta,
} from "@/config/widget-catalog"
import { cn } from "@/lib/utils"
import { WIDGET_COLORS } from "@/types/widget"
import type { WidgetColor, WidgetRole } from "@/types/widget"
import { useHomeLayout, useSaveHomeLayout } from "../api/use-home-layout"
import type { CustomLists } from "../api/use-home-layout"
import { templateList, templateName, templatesFor } from "../utils/templates"

export interface HomeViewProps {
  role: WidgetRole
  editing: boolean
  /** `then` opens a sheet in the same navigation (the long-press menu's Widget Settings) */
  onEditingChange: (
    editing: boolean,
    then?: { sheet: "edit-widget"; id: string }
  ) => void
  sheet: "add-widget" | "edit-widget" | "layout" | undefined
  sheetId: string | undefined
  onSheet: (sheet: HomeViewProps["sheet"], id?: string) => void
  /** the app layer's registry: type → widget element */
  renderWidget: (item: Placed) => ReactNode
  newId: () => string
}

function sizeLabel(type: string, w: number, h: number): string {
  const named = widgetMeta(type)?.sizeLabels?.[`${w}x${h}`]
  return named ? `${named} · ${w}×${h}` : `${w}×${h}`
}

export function HomeView(p: HomeViewProps) {
  const layout = useHomeLayout()
  const { save, dismissTip } = useSaveHomeLayout()
  const toast = useToast()
  const [bp, setBp] = useState<Breakpoint>("compact")
  const [draft, setDraft] = useState<CustomLists | null>(null)
  const [askFork, setAskFork] = useState(false)

  const usingTemplate = layout.active.kind === "template"
  const templateId =
    layout.active.kind === "template" ? layout.active.templateId : "starter"

  /** The lists the screen shows: the draft while editing, else the active layout. */
  const lists: CustomLists = useMemo(() => {
    if (draft) return draft
    if (usingTemplate || layout.newer) {
      const out: CustomLists = {}
      for (const b of BREAKPOINTS) out[b] = templateList(templateId, b, p.role)
      return out
    }
    return layout.custom
  }, [draft, usingTemplate, layout.newer, layout.custom, templateId, p.role])
  const current = listFor(lists, bp)?.items ?? []

  /** false when editing can't start right away (an update is needed, or the fork question) */
  const startEditing = (then?: {
    sheet: "edit-widget"
    id: string
  }): boolean => {
    if (layout.newer) return false
    if (p.editing) {
      if (then) p.onSheet(then.sheet, then.id)
      return true
    }
    if (usingTemplate && Object.keys(layout.custom).length > 0) {
      setAskFork(true)
      return false
    }
    // a template forks into Custom on edit: all three lists copied (H4)
    const base: CustomLists = {}
    for (const b of BREAKPOINTS)
      base[b] = usingTemplate ? templateList(templateId, b, p.role) : lists[b]
    if (!usingTemplate)
      for (const b of BREAKPOINTS) if (!layout.custom[b]) delete base[b]
    setDraft(base)
    p.onEditingChange(true, then)
    return true
  }
  const forkFrom = (source: "template" | "custom") => {
    setAskFork(false)
    const base: CustomLists = {}
    for (const b of BREAKPOINTS)
      base[b] =
        source === "template"
          ? templateList(templateId, b, p.role)
          : layout.custom[b]
    if (source === "custom")
      for (const b of BREAKPOINTS) if (!base[b]) delete base[b]
    setDraft(base)
    p.onEditingChange(true)
  }
  // switching tabs or leaving Home saves the draft, like iOS (criterion 20)
  const pending = useRef<CustomLists | null>(null)
  useEffect(() => {
    pending.current = draft
  }, [draft])
  useEffect(
    () => () => {
      if (pending.current) void save({ kind: "custom" }, pending.current)
    },
    [save]
  )

  const done = useCallback(() => {
    if (draft) void save({ kind: "custom" }, draft)
    pending.current = null
    setDraft(null)
    p.onEditingChange(false)
    p.onSheet(undefined)
  }, [draft, save, p])

  // edits on this breakpoint store its list (H2: the first edit on a breakpoint stores it)
  const setCurrent = (items: Array<GridItem>) =>
    setDraft((d) => ({ ...(d ?? {}), [bp]: items }))
  const everyList = (fn: (list: Array<GridItem>) => Array<GridItem>) =>
    setDraft((d) => {
      const base: CustomLists = { ...(d ?? {}) }
      if (!base[bp]) base[bp] = [...current]
      for (const b of BREAKPOINTS) {
        const l = base[b]
        if (l) base[b] = fn(l)
      }
      return base
    })
  const remove = (id: string) => {
    const snapshot = draft
    const title =
      widgetMeta(current.find((i) => i.id === id)?.widget ?? "")?.title ??
      "Widget"
    everyList((l) => l.filter((i) => i.id !== id))
    p.onSheet(undefined)
    toast.show({
      title: `Removed ${title}`,
      action: { label: "Undo", onAction: () => setDraft(snapshot) },
    })
  }
  /** a widget's settings and color apply on every screen size (they're about the widget) */
  const updateItem = (id: string, patch: (item: GridItem) => GridItem) =>
    everyList((l) => l.map((i) => (i.id === id ? patch(i) : i)))
  const [menuId, setMenuId] = useState<string | null>(null)
  const menuTitle =
    widgetMeta(current.find((i) => i.id === menuId)?.widget ?? "")?.title ??
    "Widget"

  const add = (type: string) => {
    const meta = widgetMeta(type)
    if (!meta) return
    const item: GridItem = {
      id: p.newId(),
      widget: type,
      w: meta.defaultSize[0],
      h: meta.defaultSize[1],
    }
    everyList((l) => [item, ...l])
    p.onSheet(undefined)
    window.scrollTo({ top: 0 })
  }

  const renderTile = (item: Placed) => {
    const meta = widgetMeta(item.widget)
    if (!meta)
      return (
        <WidgetCard title="Update needed" compact={item.w * item.h <= 2}>
          <p className="flex h-full flex-col items-center justify-center gap-1 text-center text-footnote text-muted-foreground">
            <ArrowUpCircle aria-hidden size={20} />
            <span>Update the app to see this widget</span>
          </p>
        </WidgetCard>
      )
    if (!meta.roles.includes(p.role))
      return (
        <WidgetCard title={meta.title} compact={item.w * item.h <= 2}>
          <p className="flex h-full flex-col items-center justify-center gap-1 text-center text-footnote text-muted-foreground">
            <Lock aria-hidden size={20} />
            <span>Not available for your role</span>
          </p>
        </WidgetCard>
      )
    return p.renderWidget(item)
  }

  const editItem =
    p.sheet === "edit-widget"
      ? current.find((i) => i.id === p.sheetId)
      : undefined
  const editIndex = editItem ? current.indexOf(editItem) : -1
  const cols = COLUMNS[bp]

  return (
    <div className="flex flex-col gap-4">
      {!layout.tipDismissed && usingTemplate && !p.editing ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-subhead"
        >
          <span className="flex-1">
            This is the {templateName(templateId)} layout. Tap Layout at the
            bottom to switch, or Edit Home to arrange it.
          </span>
          <button
            type="button"
            aria-label="Dismiss tip"
            onClick={() => void dismissTip()}
            className="-m-2 flex size-11 items-center justify-center"
          >
            <X aria-hidden size={16} />
          </button>
        </div>
      ) : null}

      {current.length === 0 ? (
        <div
          role="status"
          className="flex flex-col items-center gap-3 py-12 text-center"
        >
          <Inbox aria-hidden size={40} className="text-muted-foreground" />
          <p className="text-headline">Your Home is empty</p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                if (!p.editing) startEditing()
                p.onSheet("add-widget")
              }}
            >
              Add Widget
            </Button>
            <Button variant="secondary" onClick={() => p.onSheet("layout")}>
              Choose a Layout
            </Button>
          </div>
        </div>
      ) : (
        <ResizableGrid
          items={current}
          metaOf={(w) => widgetMeta(w)}
          editing={p.editing}
          renderWidget={renderTile}
          onBreakpoint={setBp}
          onChange={setCurrent}
          onRemove={remove}
          onEdit={(id) => p.onSheet("edit-widget", id)}
          onMenu={layout.newer ? undefined : setMenuId}
        />
      )}

      {p.editing ? (
        <div className="flex justify-center gap-2">
          <Button variant="secondary" onClick={() => p.onSheet("add-widget")}>
            Add Widget
          </Button>
          <Button onClick={done}>Done</Button>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <Button
            variant="plain"
            onClick={() => startEditing()}
            disabled={layout.newer}
          >
            Edit Home
          </Button>
          <button
            type="button"
            onClick={() => p.onSheet("layout")}
            aria-label={`Layout, ${layout.newer ? "update the app to use your layout" : usingTemplate ? templateName(templateId) : "Custom"}`}
            className="inline-flex min-h-11 items-center gap-1 text-footnote text-muted-foreground"
          >
            {layout.newer
              ? "Layout: Update the app to use your layout"
              : `Layout: ${usingTemplate ? templateName(templateId) : "Custom"}`}
            <ChevronDown aria-hidden size={14} />
          </button>
        </div>
      )}

      {/* Edit Widget (H3.4) */}
      <Sheet
        open={editItem !== undefined}
        onOpenChange={(o) => {
          if (!o) p.onSheet(undefined)
        }}
      >
        {editItem ? (
          <Sheet.Content
            title={widgetMeta(editItem.widget)?.title ?? "Widget"}
            closeLabel="Done"
          >
            <section aria-labelledby="ew-size">
              <h3
                id="ew-size"
                className="mb-2 text-footnote text-muted-foreground uppercase"
              >
                Size
              </h3>
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label="Size"
              >
                {allowedSizes(
                  widgetMeta(editItem.widget)?.sizes ?? {
                    kind: "fixed",
                    sizes: [],
                  },
                  cols
                ).map(([w, h]) => {
                  const on = w === editItem.w && h === editItem.h
                  return (
                    <button
                      key={`${w}x${h}`}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() =>
                        setCurrent(
                          current.map((i) =>
                            i.id === editItem.id ? { ...i, w, h } : i
                          )
                        )
                      }
                      className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-subhead ${on ? "border-primary bg-primary/10" : "border-border"}`}
                    >
                      {on ? <Check aria-hidden size={14} /> : null}
                      {sizeLabel(editItem.widget, w, h)}
                    </button>
                  )
                })}
              </div>
            </section>
            <WidgetSettingsSection
              item={editItem}
              onChange={(config) =>
                updateItem(editItem.id, (i) => ({ ...i, config }))
              }
            />
            <section aria-labelledby="ew-color" className="mt-4">
              <h3
                id="ew-color"
                className="mb-2 text-footnote text-muted-foreground uppercase"
              >
                Color
              </h3>
              <div
                role="radiogroup"
                aria-label="Color"
                className="flex flex-wrap gap-1"
              >
                {[undefined, ...WIDGET_COLORS].map((c) => {
                  const on = (editItem.color ?? undefined) === c
                  return (
                    <button
                      key={c ?? "none"}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={c ? capitalize(c) : "Default"}
                      onClick={() =>
                        updateItem(editItem.id, (i) => {
                          const { color: _drop, ...rest } = i
                          return c ? { ...rest, color: c } : rest
                        })
                      }
                      className="flex size-11 items-center justify-center"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-8 items-center justify-center rounded-full border border-border",
                          c ? TINT_SWATCH[c] : "bg-card",
                          on &&
                            "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        )}
                      >
                        {on ? (
                          <Check
                            size={16}
                            className={c ? "text-white" : "text-foreground"}
                          />
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
            <section aria-labelledby="ew-pos" className="mt-4">
              <h3
                id="ew-pos"
                className="mb-2 text-footnote text-muted-foreground uppercase"
              >
                Position
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={editIndex <= 0}
                  onClick={() =>
                    setCurrent(move(current, editIndex, editIndex - 1))
                  }
                >
                  Move Earlier
                </Button>
                <Button
                  variant="secondary"
                  disabled={editIndex >= current.length - 1}
                  onClick={() =>
                    setCurrent(move(current, editIndex, editIndex + 1))
                  }
                >
                  Move Later
                </Button>
                <Button
                  variant="secondary"
                  disabled={editIndex <= 0}
                  onClick={() => setCurrent(move(current, editIndex, 0))}
                >
                  Move to Top
                </Button>
              </div>
              <p
                aria-live="polite"
                className="mt-2 text-footnote text-muted-foreground"
              >
                Position {editIndex + 1} of {current.length}
              </p>
            </section>
            <Button
              variant="destructive"
              className="mt-6"
              onClick={() => remove(editItem.id)}
            >
              Remove Widget
            </Button>
          </Sheet.Content>
        ) : null}
      </Sheet>

      {/* Add Widget (H3.5) */}
      <Sheet
        open={p.sheet === "add-widget"}
        onOpenChange={(o) => {
          if (!o) p.onSheet(undefined)
        }}
      >
        <Sheet.Content title="Add Widget" detent="large">
          <List.Section>
            {WIDGETS.filter((w) => w.roles.includes(p.role)).map((w) => (
              <List.Row
                key={w.type}
                title={w.title}
                subtitle={w.description}
                onSelect={() => add(w.type)}
              />
            ))}
          </List.Section>
        </Sheet.Content>
      </Sheet>

      {/* Layout (H4) */}
      <Sheet
        open={p.sheet === "layout"}
        onOpenChange={(o) => {
          if (!o) p.onSheet(undefined)
        }}
      >
        <Sheet.Content title="Layout">
          <List.Section>
            {Object.keys(layout.custom).length > 0 ? (
              <List.Row
                title="Custom"
                subtitle="Your own arrangement"
                detail={
                  !usingTemplate ? (
                    <Check aria-label="Selected" size={18} />
                  ) : undefined
                }
                onSelect={() => {
                  void save({ kind: "custom" }, layout.custom)
                  p.onSheet(undefined)
                }}
              />
            ) : null}
            {templatesFor(p.role).map((t) => (
              <List.Row
                key={t.id}
                title={t.name}
                detail={
                  usingTemplate && templateId === t.id ? (
                    <Check aria-label="Selected" size={18} />
                  ) : undefined
                }
                onSelect={() => {
                  void save(
                    { kind: "template", templateId: t.id },
                    layout.custom
                  )
                  p.onSheet(undefined)
                }}
              />
            ))}
          </List.Section>
          <div className="mt-4 flex flex-col items-center gap-2">
            <Button
              variant="plain"
              onClick={() => {
                p.onSheet(undefined)
                startEditing()
              }}
              disabled={layout.newer}
            >
              Edit Home
            </Button>
            {!usingTemplate && layout.custom[bp] ? (
              <Button
                variant="plain"
                className="text-destructive"
                onClick={() => {
                  const next: CustomLists = { ...layout.custom }
                  delete next[bp]
                  void save({ kind: "custom" }, next)
                  p.onSheet(undefined)
                }}
              >
                Reset This Screen Size
              </Button>
            ) : null}
          </div>
        </Sheet.Content>
      </Sheet>

      {/* the long-press widget menu (owner) */}
      <ActionSheet
        open={menuId !== null}
        onOpenChange={(o) => {
          if (!o) setMenuId(null)
        }}
        title={menuTitle}
        actions={[
          { label: "Edit Home Screen", onSelect: () => startEditing() },
          {
            label: "Widget Settings",
            onSelect: () => {
              const id = menuId
              if (id) startEditing({ sheet: "edit-widget", id })
            },
          },
          {
            label: "Remove Widget",
            destructive: true,
            onSelect: () => {
              const id = menuId
              if (id && startEditing()) remove(id)
            },
          },
        ]}
      />

      <ActionSheet
        open={askFork}
        onOpenChange={setAskFork}
        title={`Edit ${templateName(templateId)} as Your Custom Layout?`}
        actions={[
          {
            label: "Replace Custom Layout",
            destructive: true,
            onSelect: () => forkFrom("template"),
          },
          {
            label: "Edit My Custom Layout",
            onSelect: () => forkFrom("custom"),
          },
        ]}
      />
    </div>
  )
}

const TINT_SWATCH: Record<WidgetColor, string> = {
  blue: "bg-tile-blue",
  green: "bg-tile-green",
  orange: "bg-tile-orange",
  red: "bg-tile-red",
  purple: "bg-tile-purple",
  teal: "bg-tile-teal",
  indigo: "bg-tile-indigo",
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The catalog's per-widget settings (owner: clock seconds, rankings rows…), stored in `config`. */
function WidgetSettingsSection({
  item,
  onChange,
}: {
  item: GridItem
  onChange: (config: Record<string, unknown>) => void
}) {
  const settings = widgetMeta(item.widget)?.settings ?? []
  if (settings.length === 0) return null
  const config = item.config ?? {}
  const set = (key: string, value: unknown) =>
    onChange({ ...config, [key]: value })
  return (
    <section aria-label="Widget settings" className="mt-4">
      <List.Section title="Settings">
        {settings.map((def) =>
          def.kind === "toggle" ? (
            <List.Toggle
              key={def.key}
              title={def.label}
              checked={settingOn(item.widget, config, def.key)}
              onCheckedChange={(v) => set(def.key, v)}
            />
          ) : (
            <List.Row
              key={def.key}
              title={def.label}
              detail={
                <InlineStepper
                  label={def.label}
                  value={settingCount(item.widget, config, def.key)}
                  min={def.min}
                  max={def.max}
                  onValueChange={(v) => set(def.key, v)}
                />
              }
            />
          )
        )}
      </List.Section>
    </section>
  )
}

/** A compact −/+ for a settings row (CountStepper is sized for scouting with gloves). */
function InlineStepper({
  label,
  value,
  min,
  max,
  onValueChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onValueChange: (value: number) => void
}) {
  const btn =
    "flex size-9 items-center justify-center rounded-full bg-muted text-headline text-foreground disabled:opacity-40"
  return (
    <span role="group" aria-label={label} className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Fewer ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => onValueChange(value - 1)}
        className={btn}
      >
        −
      </button>
      <output
        aria-live="polite"
        className="min-w-6 text-center text-body text-foreground tabular-nums"
      >
        {value}
      </output>
      <button
        type="button"
        aria-label={`More ${label.toLowerCase()}`}
        disabled={value >= max}
        onClick={() => onValueChange(value + 1)}
        className={btn}
      >
        +
      </button>
    </span>
  )
}
