// DataView in all six states and three sizes (data-states.md).
import { DataView } from "@/components/data-view/data-view"
import type { DataViewSize } from "@/components/data-view/data-view"
import type { DataState, MissingReason } from "@/lib/db/react/data-state"
import { GallerySection } from "./gallery-section"

const REASONS: ReadonlyArray<MissingReason> = [
  "not-found",
  "not-synced",
  "not-scouted",
  "forbidden",
]

const STATES: ReadonlyArray<[string, DataState<ReadonlyArray<string>>]> = [
  ["Idle", { status: "idle" }],
  ["Loading", { status: "loading" }],
  ["Empty", { status: "empty" }],
  ...REASONS.map((reason): [string, DataState<ReadonlyArray<string>>] => [
    `Missing: ${reason}`,
    { status: "missing", reason },
  ]),
  [
    "Error",
    {
      status: "error",
      error: { code: "db", message: "Couldn't load this. Try again." },
      retry: () => undefined,
    },
  ],
  ["Success", { status: "success", data: ["Row one", "Row two"] }],
  ["Success (stale)", { status: "success", data: ["Cached row"], stale: true }],
]

export function StatesPage() {
  return (
    <>
      {(["page", "section", "inline"] as const).map((size: DataViewSize) => (
        <GallerySection key={size} title={`DataView, ${size}`}>
          {STATES.map(([label, state]) => (
            <div
              key={label}
              className="rounded-xl border border-dashed border-border p-3"
            >
              <p className="mb-2 text-caption-1 text-muted-foreground">
                {label}
              </p>
              <DataView state={state} size={size}>
                <DataView.Success<ReadonlyArray<string>>>
                  {(rows, { stale }) => (
                    <ul className="text-body">
                      {rows.map((r) => (
                        <li key={r}>
                          {r}
                          {stale ? " (not up to date)" : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </DataView.Success>
              </DataView>
            </div>
          ))}
        </GallerySection>
      ))}
    </>
  )
}
