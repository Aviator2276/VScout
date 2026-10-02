// The active event picker (features/settings.md "Event picker", ADR-037): upcoming and current
// events first, then past ones. A guest sees only the event their code belongs to (ADR-073).
import { DataView } from "@/components/data-view/data-view"
import { Check, CalendarDays } from "@/components/icons/icon"
import { List } from "@/components/list/list"
import type { EventRecord } from "@/lib/db/types"
import { useEvents } from "../api/use-events"
import { formatEventDates, splitByDate } from "../utils/event-dates"

export interface EventPickerProps {
  selectedKey: string | null
  onPick: (key: string) => void
  /** YYYY-MM-DD, from the caller (render stays pure) */
  today: string
  /** a guest's event: the only one listed */
  onlyKey?: string | null
}

export function EventPicker({
  selectedKey,
  onPick,
  today,
  onlyKey,
}: EventPickerProps) {
  const state = useEvents()
  return (
    <DataView state={state} size="page">
      <DataView.Loading label="Loading events…" />
      <DataView.Empty
        icon={CalendarDays}
        title="No events available"
        description="Check your connection or ask an admin."
      />
      <DataView.Missing
        not-synced={{
          icon: CalendarDays,
          title: "Events aren't on this device yet",
          description: "Connect to the internet to download the event list.",
        }}
      />
      <DataView.Success<ReadonlyArray<EventRecord>>>
        {(events) => {
          const visible = onlyKey
            ? events.filter((e) => e.key === onlyKey)
            : events
          const { current, past } = splitByDate(visible, today)
          return (
            <>
              <EventSection
                title="Events"
                events={current}
                selectedKey={selectedKey}
                onPick={onPick}
              />
              <EventSection
                title="Past Events"
                events={past}
                selectedKey={selectedKey}
                onPick={onPick}
              />
            </>
          )
        }}
      </DataView.Success>
    </DataView>
  )
}

function EventSection({
  title,
  events,
  selectedKey,
  onPick,
}: {
  title: string
  events: ReadonlyArray<EventRecord>
  selectedKey: string | null
  onPick: (key: string) => void
}) {
  if (events.length === 0) return null
  return (
    <List.Section title={title}>
      {events.map((e) => (
        <List.Row
          key={e.key}
          title={e.isDemo ? `${e.name} (Demo)` : e.name}
          subtitle={formatEventDates(e.startDate, e.endDate)}
          {...(e.key === selectedKey
            ? {
                detail: (
                  <Check
                    aria-label="Selected"
                    size={20}
                    className="text-primary"
                  />
                ),
              }
            : {})}
          onSelect={() => onPick(e.key)}
        />
      ))}
    </List.Section>
  )
}
