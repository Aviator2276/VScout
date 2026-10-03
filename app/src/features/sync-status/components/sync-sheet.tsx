// The Sync sheet (features/sync-status.md S3): status, ping and speeds, the connection chart, then
// what needs attention, what's waiting to upload, and recent transfers. Errors come first. Opened by
// any page's notch (syncSheetStore); one sheet for the whole app.
import { AnimatePresence, m } from "motion/react"
import { useState, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import { Button } from "@/components/controls/button"
import {
  ArrowDown,
  ArrowUp,
  CircleX,
  Clock,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "@/components/icons/icon"
import { SwipeRow } from "@/components/list/swipe-row"
import { springs } from "@/components/motion/springs"
import { ActionSheet } from "@/components/overlays/action-sheet"
import type { ActionSheetAction } from "@/components/overlays/action-sheet"
import { Sheet } from "@/components/overlays/sheet"
import { useToast } from "@/components/overlays/toaster"
import { ConflictSheet } from "@/components/sync/conflict-sheet"
import { formatAgo } from "@/components/sync/sync-badge"
import { useOpenConflicts, useResolveConflict } from "@/hooks/use-conflicts"
import { useNow } from "@/hooks/use-now"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { formatBytes, formatRate } from "@/lib/network/network-status"
import { HISTORY_MS, SAMPLE_MS } from "@/lib/network/network-telemetry"
import type { TransferRecord } from "@/lib/network/network-telemetry"
import type { ConflictView } from "@/lib/sync/conflict-view"
import {
  canDiscard,
  discardUnsentCreate,
  retryNow,
} from "@/lib/sync/outbox-actions"
import { cn } from "@/lib/utils"
import { useNetworkStatus } from "../api/use-network-status"
import { useSyncSummary } from "../api/use-sync-summary"
import { opStatus, useWaitingOps } from "../api/use-waiting-ops"
import type { WaitingOp } from "../api/use-waiting-ops"
import { syncSheetStore } from "../stores/sync-sheet"
import { groupTransfers } from "../utils/connection-chart"
import { ConnectionChart } from "./connection-chart"
import { DOWN_COLOR, UP_COLOR } from "./sync-notch"

/** Speed reads "Idle" after this long without a transfer in that direction. */
const IDLE_AFTER_MS = 30_000

const clock = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="mb-1.5 px-1 text-footnote text-muted-foreground uppercase"
    >
      {children}
    </h3>
  )
}

function Tile({
  label,
  value,
  detail,
  icon,
}: {
  label: string
  value: string
  detail?: string
  icon?: ReactNode
}) {
  return (
    <li className="flex flex-col gap-0.5 rounded-2xl bg-card p-3 shadow-xs">
      <span className="flex items-center gap-1 text-caption-1 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-heading text-title-3">{value}</span>
      {detail ? (
        <span className="text-caption-2 text-muted-foreground">{detail}</span>
      ) : null}
    </li>
  )
}

function Row({
  icon,
  title,
  status,
  tone = "neutral",
  onSelect,
}: {
  icon: ReactNode
  title: string
  status: string
  tone?: "neutral" | "warning" | "destructive"
  onSelect?: () => void
}) {
  const body = (
    <>
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-start text-body">
        {title}
      </span>
      <span
        className={cn(
          "shrink-0 text-subhead tabular-nums",
          tone === "warning"
            ? "text-warning"
            : tone === "destructive"
              ? "text-destructive"
              : "text-muted-foreground"
        )}
      >
        {status}
      </span>
    </>
  )
  const cls =
    "flex min-h-12 w-full items-center gap-3 bg-card px-4 py-2 active:bg-muted"
  return onSelect ? (
    <button type="button" onClick={onSelect} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function TransferRow({ t, now }: { t: TransferRecord; now: number }) {
  const Icon = t.dir === "up" ? ArrowUp : ArrowDown
  return (
    <li className="border-b border-border last:border-b-0">
      <Row
        icon={
          t.outcome === "active" ? (
            <LoaderCircle
              size={16}
              className="animate-spin text-muted-foreground motion-reduce:animate-none"
            />
          ) : t.outcome === "failed" ? (
            <CircleX size={16} className="text-destructive" />
          ) : (
            <Icon
              size={16}
              strokeWidth={2.5}
              color={t.dir === "up" ? UP_COLOR : DOWN_COLOR}
            />
          )
        }
        title={t.count && t.count > 1 ? `${t.label} · ${t.count}` : t.label}
        status={
          t.outcome === "active"
            ? t.dir === "up"
              ? "Uploading…"
              : "Downloading…"
            : t.outcome === "failed"
              ? "Failed"
              : [
                  t.bytes ? formatBytes(t.bytes) : null,
                  t.via === "live" ? "Live" : t.via === "mqtt" ? "MQTT" : null,
                  formatAgo(Math.max(0, now - t.at)),
                ]
                  .filter(Boolean)
                  .join(" · ")
        }
        tone={t.outcome === "failed" ? "destructive" : "neutral"}
      />
    </li>
  )
}

export function SyncSheet({
  onNavigate,
}: {
  /** the app layer navigates (sheets never change the route behind them themselves) */
  onNavigate: (href: string) => void
}) {
  const open = useSyncExternalStore(
    syncSheetStore.subscribe,
    syncSheetStore.getSnapshot,
    () => false
  )
  const [conflict, setConflict] = useState<ConflictView | null>(null)
  const resolve = useResolveConflict()
  return (
    <>
      <Sheet open={open} onOpenChange={(o) => syncSheetStore.set(o)}>
        <Sheet.Content title="Sync" detent="large">
          {open ? (
            <SyncSheetBody
              onConflict={(v) => {
                // one sheet at a time (HIG): the conflict sheet replaces this one
                syncSheetStore.set(false)
                setConflict(v)
              }}
              onNavigate={(href) => {
                syncSheetStore.set(false)
                onNavigate(href)
              }}
            />
          ) : null}
        </Sheet.Content>
      </Sheet>
      <ConflictSheet
        view={conflict}
        onOpenChange={(o) => {
          if (!o) setConflict(null)
        }}
        onAction={async (action) => {
          if (!conflict) return
          if (action === "edit-and-retry") {
            setConflict(null)
            onNavigate("/scouting/mine?show=attention")
            return
          }
          await resolve(conflict.conflict.id, action)
          setConflict(null)
        }}
      />
    </>
  )
}

function SyncSheetBody({
  onConflict,
  onNavigate,
}: {
  onConflict: (v: ConflictView) => void
  onNavigate: (href: string) => void
}) {
  const status = useNetworkStatus()
  const summary = useSyncSummary()
  const { db, requestSync, live } = useDataRuntime()
  const conflicts = useOpenConflicts()
  const waiting = useWaitingOps()
  const toast = useToast()
  const now = useNow(5_000)
  const [acting, setActing] = useState<WaitingOp | null>(null)
  const network = status.network

  const headline =
    status.connection === "offline"
      ? "Offline"
      : status.connection === "online"
        ? `Connected · ${["", "Weak", "Fair", "Good", "Strong"][status.quality] ?? ""} signal`
        : "Connecting…"
  const speed = (bps: number | null, at: number | null) =>
    bps === null || at === null || now - at > IDLE_AFTER_MS
      ? "Idle"
      : formatRate(bps)
  const conflictList = conflicts.status === "success" ? conflicts.data : []

  const retry = async (w: WaitingOp) => {
    // `now` is at most 5 s old, so the op is due at once
    await retryNow(db, w.op, now)
    requestSync?.()
    toast.show({ title: "Retrying now" })
  }
  const actionsFor = (w: WaitingOp): Array<ActionSheetAction> => [
    ...(w.op.state === "queued" || w.op.state === "blocked"
      ? [{ label: "Retry Now", onSelect: () => void retry(w) }]
      : []),
    ...(w.op.kind === "delete" && live
      ? [
          {
            label: "Undo Delete",
            onSelect: () =>
              void live.restore(w.op.entity, w.op.recordId).then((r) =>
                toast.show({
                  title: r.kind === "ok" ? "Delete undone" : "Couldn’t undo",
                })
              ),
          },
        ]
      : []),
    ...(canDiscard(w.op)
      ? [
          {
            label: "Discard",
            destructive: true,
            onSelect: () =>
              void discardUnsentCreate(db, w.op).then(() =>
                toast.show({ title: "Discarded" })
              ),
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div role="status" className="flex flex-col gap-0.5 px-1">
        <p className="text-title-3 font-semibold">
          {status.attentionCount > 0
            ? `${status.attentionCount} ${status.attentionCount === 1 ? "change needs" : "changes need"} attention`
            : headline}
        </p>
        <p className="text-subhead text-muted-foreground">
          {status.connection === "offline"
            ? `Offline. Changes are saved on this device and sync when you’re back online.`
            : summary.lastSuccessAt
              ? `Last synced ${clock.format(summary.lastSuccessAt)}`
              : "Not synced yet on this device"}
        </p>
      </div>

      <ul className="grid grid-cols-3 gap-2" aria-label="Connection">
        <Tile
          label="Ping"
          value={
            network.pingMs === null || status.connection === "offline"
              ? "—"
              : `${network.pingMs} ms`
          }
          {...(network.pingAt !== null && now - network.pingAt > 60_000
            ? { detail: formatAgo(now - network.pingAt) }
            : {})}
        />
        <Tile
          label="Download"
          icon={
            <ArrowDown
              aria-hidden
              size={12}
              strokeWidth={2.5}
              color={DOWN_COLOR}
            />
          }
          value={speed(network.downBps, network.lastDownAt)}
        />
        <Tile
          label="Upload"
          icon={
            <ArrowUp aria-hidden size={12} strokeWidth={2.5} color={UP_COLOR} />
          }
          value={speed(network.upBps, network.lastUpAt)}
        />
      </ul>

      <ConnectionChart
        samples={network.history}
        windowMs={HISTORY_MS}
        sampleMs={SAMPLE_MS}
        now={now}
      />

      <AnimatePresence initial={false}>
        {conflictList.length > 0 || summary.signInNeeded ? (
          <m.section
            key="attention"
            aria-labelledby="sync-attention"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={springs.smooth}
          >
            <SectionTitle id="sync-attention">Needs Attention</SectionTitle>
            <ul className="overflow-hidden rounded-2xl shadow-xs">
              {summary.signInNeeded ? (
                <li className="border-b border-border last:border-b-0">
                  <Row
                    icon={<KeyRound size={16} className="text-warning" />}
                    title="Sign in to keep syncing"
                    status="Sign In"
                    tone="warning"
                    onSelect={() => onNavigate("/login?reauth=true")}
                  />
                </li>
              ) : null}
              {conflictList.map((v) => (
                <li
                  key={v.conflict.id}
                  className="border-b border-border last:border-b-0"
                >
                  <SwipeRow
                    trailing={[
                      {
                        label: "Resolve",
                        icon: TriangleAlert,
                        tone: "warning",
                        onAction: () => onConflict(v),
                      },
                    ]}
                  >
                    <Row
                      icon={
                        <TriangleAlert size={16} className="text-warning" />
                      }
                      title={v.title}
                      status={
                        v.conflict.kind === "rejected" ||
                        v.conflict.kind === "forbidden"
                          ? "Not saved"
                          : "Conflict"
                      }
                      tone="warning"
                      onSelect={() => onConflict(v)}
                    />
                  </SwipeRow>
                </li>
              ))}
            </ul>
            {conflictList.length > 3 ? (
              <button
                type="button"
                onClick={() => onNavigate("/settings/conflicts")}
                className="mt-1.5 min-h-11 px-1 text-subhead text-primary"
              >
                Open Sync Conflicts in Settings
              </button>
            ) : null}
          </m.section>
        ) : null}
      </AnimatePresence>

      {waiting.length > 0 ? (
        <section aria-labelledby="sync-waiting">
          <SectionTitle id="sync-waiting">Waiting to Upload</SectionTitle>
          <ul className="overflow-hidden rounded-2xl shadow-xs">
            {waiting.map((w) => {
              const actions = actionsFor(w)
              return (
                <li
                  key={w.op.opId}
                  className="border-b border-border last:border-b-0"
                >
                  <SwipeRow
                    trailing={[
                      ...(actions.some((a) => a.label === "Retry Now")
                        ? [
                            {
                              label: "Retry",
                              icon: RefreshCw,
                              tone: "primary" as const,
                              onAction: () => void retry(w),
                            },
                          ]
                        : []),
                    ]}
                  >
                    <Row
                      icon={
                        w.op.state === "inflight" ? (
                          <LoaderCircle
                            size={16}
                            className="animate-spin text-muted-foreground motion-reduce:animate-none"
                          />
                        ) : (
                          <Clock size={16} className="text-muted-foreground" />
                        )
                      }
                      title={w.title}
                      status={opStatus(w.op, now)}
                      {...(actions.length > 0
                        ? { onSelect: () => setActing(w) }
                        : {})}
                    />
                  </SwipeRow>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {network.transfers.length > 0 ? (
        <section aria-labelledby="sync-recent">
          <SectionTitle id="sync-recent">Recent</SectionTitle>
          <ul className="overflow-hidden rounded-2xl shadow-xs">
            {groupTransfers(network.transfers)
              .slice(0, 20)
              .map((t) => (
                <TransferRow key={t.id} t={t} now={now} />
              ))}
          </ul>
        </section>
      ) : null}

      <Button
        size="large"
        disabled={status.connection === "offline" || !requestSync}
        onClick={() => {
          requestSync?.()
          toast.show({ title: "Syncing" })
        }}
      >
        Sync Now
      </Button>
      {status.connection === "offline" ? (
        <p className="-mt-3 text-center text-footnote text-muted-foreground">
          Syncing needs a connection.
        </p>
      ) : null}

      <ActionSheet
        open={acting !== null}
        onOpenChange={(o) => {
          if (!o) setActing(null)
        }}
        title={acting?.title ?? ""}
        {...(acting && canDiscard(acting.op)
          ? {
              message:
                "Discard removes it from this device. It was never sent.",
            }
          : {})}
        actions={(acting ? actionsFor(acting) : []).map((a) => ({
          ...a,
          onSelect: () => {
            setActing(null)
            a.onSelect()
          },
        }))}
      />
    </div>
  )
}
