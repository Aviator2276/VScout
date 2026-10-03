// The Sync details (features/sync-status.md S3), shown in a large tooltip under the notch: status,
// ping and speeds, the connection chart, then what needs attention, what's waiting to upload, and
// recent transfers (scrolling on their own). Errors come first. Row actions open in place, since a
// tooltip closes when anything outside it is tapped.
import { AnimatePresence, m } from "motion/react"
import { useState } from "react"
import type { ReactNode } from "react"
import { Button } from "@/components/controls/button"
import {
  ArrowDown,
  ArrowUp,
  CircleX,
  Clock,
  KeyRound,
  LoaderCircle,
  TriangleAlert,
} from "@/components/icons/icon"
import { springs } from "@/components/motion/springs"
import { useToast } from "@/components/overlays/toaster"
import { formatAgo } from "@/components/sync/sync-badge"
import { useOpenConflicts } from "@/hooks/use-conflicts"
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
import { groupTransfers } from "../utils/connection-chart"
import { ConnectionChart } from "./connection-chart"

/** Speed reads "Idle" after this long without a transfer in that direction. */
const IDLE_AFTER_MS = 30_000

const clock = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})

const SIGNAL = ["", "Weak", "Fair", "Good", "Strong"]

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
    <li className="flex flex-col gap-0.5 rounded-xl bg-card p-2.5 shadow-xs">
      <span className="flex items-center gap-1 text-caption-1 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-heading text-headline">{value}</span>
      {detail ? (
        <span className="text-caption-2 text-muted-foreground">{detail}</span>
      ) : null}
    </li>
  )
}

const ROW =
  "flex min-h-11 w-full items-center gap-3 bg-card px-3 py-2 text-start"

function RowBody({
  icon,
  title,
  status,
  tone = "neutral",
}: {
  icon: ReactNode
  title: string
  status: string
  tone?: "neutral" | "warning" | "destructive"
}) {
  return (
    <>
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-subhead">{title}</span>
      <span
        className={cn(
          "shrink-0 text-footnote tabular-nums",
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
}

function TransferRow({ t, now }: { t: TransferRecord; now: number }) {
  const Icon = t.dir === "up" ? ArrowUp : ArrowDown
  return (
    <li className={cn(ROW, "border-b border-border last:border-b-0")}>
      <RowBody
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
              color={t.dir === "up" ? "var(--notch-up)" : "var(--notch-down)"}
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

/** A waiting change: tap to show Retry Now / Discard / Undo Delete in place. */
function WaitingRow({ w, now }: { w: WaitingOp; now: number }) {
  const { db, requestSync, live } = useDataRuntime()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const retryable = w.op.state === "queued" || w.op.state === "blocked"
  const discardable = canDiscard(w.op)
  const undoable = w.op.kind === "delete" && live !== undefined
  const any = retryable || discardable || undoable
  const panel = `waiting-${w.op.opId}`
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        className={cn(ROW, "active:bg-muted disabled:active:bg-card")}
        disabled={!any}
        aria-expanded={any ? open : undefined}
        aria-controls={any ? panel : undefined}
        onClick={() => {
          setOpen((o) => !o)
          setConfirming(false)
        }}
      >
        <RowBody
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
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <m.div
            id={panel}
            key="actions"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springs.snappy}
            className="overflow-hidden bg-card"
          >
            <div className="flex flex-wrap gap-2 px-3 pb-2.5">
              {confirming ? (
                <>
                  <p className="w-full text-footnote text-muted-foreground">
                    Discard removes it from this device. It was never sent.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() =>
                      void discardUnsentCreate(db, w.op).then(() =>
                        toast.show({ title: "Discarded" })
                      )
                    }
                  >
                    Discard
                  </Button>
                </>
              ) : (
                <>
                  {retryable ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setOpen(false)
                        // `now` is at most 5 s old, so the op is due at once
                        void retryNow(db, w.op, now).then(() => {
                          requestSync?.()
                          toast.show({ title: "Retrying now" })
                        })
                      }}
                    >
                      Retry Now
                    </Button>
                  ) : null}
                  {undoable ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void live
                          .restore(w.op.entity, w.op.recordId)
                          .then((r) =>
                            toast.show({
                              title:
                                r.kind === "ok"
                                  ? "Delete undone"
                                  : "Couldn’t undo",
                            })
                          )
                      }
                    >
                      Undo Delete
                    </Button>
                  ) : null}
                  {discardable ? (
                    <Button
                      variant="plain"
                      className="text-destructive"
                      onClick={() => setConfirming(true)}
                    >
                      Discard…
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </li>
  )
}

export function SyncPanel({
  onConflict,
  onNavigate,
}: {
  /** open the conflict sheet (the tooltip closes first) */
  onConflict: (v: ConflictView) => void
  /** leave for another page (the tooltip closes first) */
  onNavigate: (href: string) => void
}) {
  const status = useNetworkStatus()
  const summary = useSyncSummary()
  const { requestSync } = useDataRuntime()
  const conflicts = useOpenConflicts()
  const waiting = useWaitingOps()
  const toast = useToast()
  const now = useNow(5_000)
  const network = status.network
  const conflictList = conflicts.status === "success" ? conflicts.data : []
  const speed = (bps: number | null, at: number | null) =>
    bps === null || at === null || now - at > IDLE_AFTER_MS
      ? "Idle"
      : formatRate(bps)

  return (
    <div className="flex flex-col gap-4">
      <div role="status" className="flex flex-col gap-0.5 px-1">
        <p className="text-headline">
          {status.attentionCount > 0
            ? `${status.attentionCount} ${status.attentionCount === 1 ? "change needs" : "changes need"} attention`
            : status.connection === "offline"
              ? "Offline"
              : status.connection === "online"
                ? `Connected · ${SIGNAL[status.quality] ?? ""} signal`
                : "Connecting…"}
        </p>
        <p className="text-footnote text-muted-foreground">
          {status.connection === "offline"
            ? "Changes are saved on this device and sync when you’re back online."
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
          label="Down"
          icon={
            <ArrowDown
              aria-hidden
              size={12}
              strokeWidth={2.5}
              color="var(--notch-down)"
            />
          }
          value={speed(network.downBps, network.lastDownAt)}
        />
        <Tile
          label="Up"
          icon={
            <ArrowUp
              aria-hidden
              size={12}
              strokeWidth={2.5}
              color="var(--notch-up)"
            />
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

      {conflictList.length > 0 || summary.signInNeeded ? (
        <section aria-labelledby="sync-attention">
          <SectionTitle id="sync-attention">Needs Attention</SectionTitle>
          <ul className="overflow-hidden rounded-xl shadow-xs">
            {summary.signInNeeded ? (
              <li className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  className={cn(ROW, "active:bg-muted")}
                  onClick={() => onNavigate("/login?reauth=true")}
                >
                  <RowBody
                    icon={<KeyRound size={16} className="text-warning" />}
                    title="Sign in to keep syncing"
                    status="Sign In"
                    tone="warning"
                  />
                </button>
              </li>
            ) : null}
            {conflictList.map((v) => (
              <li
                key={v.conflict.id}
                className="border-b border-border last:border-b-0"
              >
                <button
                  type="button"
                  className={cn(ROW, "active:bg-muted")}
                  onClick={() => onConflict(v)}
                >
                  <RowBody
                    icon={<TriangleAlert size={16} className="text-warning" />}
                    title={v.title}
                    status={
                      v.conflict.kind === "rejected" ||
                      v.conflict.kind === "forbidden"
                        ? "Not saved"
                        : "Conflict"
                    }
                    tone="warning"
                  />
                </button>
              </li>
            ))}
          </ul>
          {conflictList.length > 3 ? (
            <button
              type="button"
              onClick={() => onNavigate("/settings/conflicts")}
              className="mt-1 min-h-11 px-1 text-subhead text-primary"
            >
              Open Sync Conflicts in Settings
            </button>
          ) : null}
        </section>
      ) : null}

      {waiting.length > 0 ? (
        <section aria-labelledby="sync-waiting">
          <SectionTitle id="sync-waiting">Waiting to Upload</SectionTitle>
          <ul className="overflow-hidden rounded-xl shadow-xs">
            {waiting.map((w) => (
              <WaitingRow key={w.op.opId} w={w} now={now} />
            ))}
          </ul>
        </section>
      ) : null}

      {network.transfers.length > 0 ? (
        <section aria-labelledby="sync-recent">
          <SectionTitle id="sync-recent">Recent</SectionTitle>
          {/* its own scroll: a busy event fills this up fast */}
          <ul
            tabIndex={0}
            aria-labelledby="sync-recent"
            className="max-h-56 overflow-y-auto overscroll-contain rounded-xl shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {groupTransfers(network.transfers).map((t) => (
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
        <p className="-mt-2 text-center text-footnote text-muted-foreground">
          Syncing needs a connection.
        </p>
      ) : null}
    </div>
  )
}
