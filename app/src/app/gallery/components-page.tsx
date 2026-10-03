// Every shared primitive in its interesting states.
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { ChipGroup } from "@/components/controls/chip-group"
import { ChoiceChips } from "@/components/controls/choice-chips"
import { CountStepper } from "@/components/controls/count-stepper"
import { Segmented } from "@/components/controls/segmented"
import { StageStepper } from "@/components/controls/stage-stepper"
import { Switch } from "@/components/controls/switch"
import { ZoneMap } from "@/components/controls/zone-map"
import { TextArea, TextField } from "@/components/form/text-field"
import { House } from "@/components/icons/icon"
import { Logo } from "@/components/icons/logo"
import { ComingSoon } from "@/components/layout/coming-soon"
import { OfflineBanner } from "@/components/layout/offline-banner"
import {
  ForcedUpdateBanner,
  UpdateReadyBanner,
  UpdatedElsewhereBanner,
} from "@/components/layout/update-banner"
import { List } from "@/components/list/list"
import { Glass } from "@/components/surfaces/glass"
import {
  ConflictBadge,
  RefreshingIndicator,
  StaleNote,
  SyncBadge,
} from "@/components/sync/sync-badge"
import { SyncPill } from "@/components/sync/sync-pill"
import type { SyncPillState } from "@/components/sync/sync-pill"
import { GallerySection } from "./gallery-section"

const PILLS: ReadonlyArray<SyncPillState> = [
  { kind: "synced" },
  { kind: "syncing" },
  { kind: "pending", count: 3 },
  { kind: "offline" },
  { kind: "conflict", count: 1 },
  { kind: "rejected", count: 2 },
]

const ZONES = [0, 1, 2, 3].map((i) => ({
  id: `zone${i + 1}`,
  label: `Zone ${i + 1}`,
  polygon: [
    [i / 4, 0],
    [(i + 1) / 4, 0],
    [(i + 1) / 4, 1],
    [i / 4, 1],
  ] as const,
}))
const FIELD = {
  src: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect width="400" height="200" fill="#7a8a80"/><line x1="200" y1="0" x2="200" y2="200" stroke="white" stroke-width="4"/></svg>')}`,
  width: 400,
  height: 200,
  alt: "Field",
}

export function ComponentsPage({ now }: { now: number }) {
  const [segment, setSegment] = useState<"one" | "two" | "three" | null>(null)
  const [choice, setChoice] = useState<string | null>("b")
  const [chips, setChips] = useState<Array<string>>(["fast"])
  const [count, setCount] = useState(2)
  const [on, setOn] = useState(true)
  const [zone, setZone] = useState<string | null>(null)
  const [stage, setStage] = useState("teleop")
  const [text, setText] = useState("")

  return (
    <>
      <GallerySection title="Brand">
        <div className="flex items-center gap-4">
          <Logo size="xl" decorative />
          <Logo size="md" />
        </div>
      </GallerySection>

      <GallerySection title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="plain">Plain</Button>
          <Button variant="destructive">Delete</Button>
          <Button disabled>Disabled</Button>
        </div>
        <Button size="large">Large Primary</Button>
      </GallerySection>

      <GallerySection title="List">
        <List.Section title="Section" footer="A footer explains the section.">
          <List.Row title="Navigates" detail="Detail" href="/dev/gallery" />
          <List.Row title="Acts in place" onSelect={() => undefined} />
          <List.Row title="Static" subtitle="With a subtitle" detail="Value" />
          <List.Toggle title="Toggle" checked={on} onCheckedChange={setOn} />
        </List.Section>
      </GallerySection>

      <GallerySection title="Controls">
        <Segmented
          label="Segmented, unset"
          options={[
            { value: "one", label: "One" },
            { value: "two", label: "Two" },
            { value: "three", label: "Three" },
          ]}
          value={segment}
          onValueChange={setSegment}
          size="form"
        />
        <ChoiceChips
          label="Choice chips"
          options={[
            { value: "a", label: "Alpha" },
            { value: "b", label: "Bravo" },
            { value: "c", label: "Charlie" },
            { value: "d", label: "A longer option" },
          ]}
          value={choice}
          onValueChange={setChoice}
          size="form"
        />
        <ChipGroup
          label="Chip group"
          options={[
            { value: "fast", label: "Fast" },
            { value: "slow", label: "Slow" },
            { value: "off", label: "Unavailable", disabled: true },
          ]}
          value={chips}
          onValueChange={setChips}
          size="form"
        />
        <CountStepper
          label="items"
          value={count}
          onValueChange={setCount}
          min={0}
          max={5}
        />
        <div className="flex items-center justify-between">
          <span className="text-body">Switch</span>
          <Switch label="Switch" checked={on} onCheckedChange={setOn} />
        </div>
        <StageStepper
          label="Stage stepper"
          steps={[
            { id: "pre", label: "Pre", status: "done" },
            { id: "auto", label: "Auto", status: "issue" },
            { id: "teleop", label: "Teleop", status: "todo" },
            { id: "post", label: "Post", status: "todo" },
          ]}
          current={stage}
          onSelect={setStage}
        />
        <ZoneMap
          label="Zone map"
          image={FIELD}
          zones={ZONES}
          value={zone}
          onValueChange={setZone}
        />
      </GallerySection>

      <GallerySection title="Text">
        <TextField label="Text field" value={text} onValueChange={setText} />
        <TextField
          label="With an error"
          value="2O26"
          onValueChange={() => undefined}
          description="Help text sits under the label."
          errors={["Use digits only."]}
        />
        <TextArea label="Text area" value={text} onValueChange={setText} />
      </GallerySection>

      <GallerySection title="Sync">
        <div className="flex flex-wrap gap-2">
          <SyncBadge state="pending" />
          <SyncBadge state="conflict" />
          <SyncBadge state="rejected" />
          <ConflictBadge onResolve={() => undefined} />
        </div>
        <StaleNote updatedAt={now - 4 * 60_000} offline now={now} />
        <StaleNote updatedAt={now - 3 * 3_600_000} offline={false} now={now} />
        <RefreshingIndicator />
        <div className="flex flex-wrap gap-2">
          {PILLS.map((p) => (
            <SyncPill key={p.kind} state={p} onSelect={() => undefined} />
          ))}
        </div>
      </GallerySection>

      <GallerySection title="Banners">
        <OfflineBanner />
        <UpdateReadyBanner
          version="2.0.1"
          onUpdate={() => undefined}
          onLater={() => undefined}
        />
        <ForcedUpdateBanner copy="finish-form" />
        <ForcedUpdateBanner copy="offline" />
        <UpdatedElsewhereBanner onReload={() => undefined} />
      </GallerySection>

      <GallerySection title="Surfaces">
        <Glass className="p-4">
          <p className="text-body">Glass panel</p>
          <p className="text-footnote text-muted-foreground">
            Chrome only: nav bars, tab bar, toasts.
          </p>
        </Glass>
        <ComingSoon
          icon={House}
          title="Placeholder"
          description="A tab whose feature isn't built yet."
        />
      </GallerySection>
    </>
  )
}
