// The Home widget registry (features/home.md H5): type → the owning feature's component. App
// layer, because features never import each other. Each widget sits in its own error boundary so
// one failing widget never blanks Home (criterion 28).
import { ErrorBoundary } from "react-error-boundary"
import type { ComponentType } from "react"
import type { Placed } from "@/components/grid/grid-engine"
import { WidgetCard } from "@/components/grid/widget-card"
import { widgetMeta } from "@/config/widget-catalog"
import { LiveAllianceWidget } from "@/features/alliance-selection/components/widgets"
import {
  ClockWidget,
  PitMapWidget,
} from "@/features/home-widgets/components/widgets"
import {
  OurNextMatchWidget,
  WatchedTeamsWidget,
} from "@/features/matches/components/widgets"
import {
  AnnouncementsWidget,
  RecentMessagesWidget,
} from "@/features/messages/components/widgets"
import { FollowedPicklistWidget } from "@/features/picklists/components/widgets"
import {
  CoverageOverviewWidget,
  MyCoverageWidget,
  NeedsScoutingWidget,
  ResumeDraftsWidget,
} from "@/features/scouting/components/widgets"
import { RankingsWidget } from "@/features/teams/components/widgets"
import type { WidgetProps } from "@/types/widget"

const REGISTRY: Record<string, ComponentType<WidgetProps>> = {
  ourNextMatch: OurNextMatchWidget,
  needsScouting: NeedsScoutingWidget,
  clock: ClockWidget,
  announcements: AnnouncementsWidget,
  resumeDrafts: ResumeDraftsWidget,
  rankings: RankingsWidget,
  watchedTeams: WatchedTeamsWidget,
  recentMessages: RecentMessagesWidget,
  followedPicklist: FollowedPicklistWidget,
  liveAlliance: LiveAllianceWidget,
  myCoverage: MyCoverageWidget,
  coverageOverview: CoverageOverviewWidget,
  pitMap: PitMapWidget,
}

export function renderHomeWidget(eventKey: string) {
  return function HomeWidget(item: Placed) {
    const Widget = REGISTRY[item.widget]
    const title = widgetMeta(item.widget)?.title ?? "Widget"
    if (!Widget) return null
    return (
      <ErrorBoundary
        fallback={
          <WidgetCard title={title}>
            <p role="alert" className="text-subhead text-muted-foreground">
              Couldn’t show {title}.
            </p>
          </WidgetCard>
        }
      >
        <Widget
          w={item.w}
          h={item.h}
          eventKey={eventKey}
          {...(item.config ? { config: item.config } : {})}
        />
      </ErrorBoundary>
    )
  }
}
