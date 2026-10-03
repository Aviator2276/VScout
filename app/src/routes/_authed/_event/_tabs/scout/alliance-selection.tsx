import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { z } from "zod"
import { Segmented } from "@/components/controls/segmented"
import { Ellipsis } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { ActionMenu } from "@/components/overlays/menu"
import { useToast } from "@/components/overlays/toaster"
import {
  useAllianceBoard,
  useFollowedOrder,
  useNicknames,
  useRankedTeams,
  useUserNames,
} from "@/features/alliance-selection/api/get-board"
import {
  useSimWrites,
  useSims,
} from "@/features/alliance-selection/api/get-sims"
import {
  BoardView,
  HistorySheet,
  RecordSheet,
} from "@/features/alliance-selection/components/board-view"
import type { BoardViewModel } from "@/features/alliance-selection/components/board-view"
import {
  applyAction,
  pickableFor,
  replay,
} from "@/features/alliance-selection/utils/selection-rules"
import type { LocalAction } from "@/features/alliance-selection/utils/selection-rules"
import { useOnline } from "@/hooks/use-online"
import { useHideTabBar } from "@/hooks/use-tab-bar"
import { can } from "@/lib/authorization"
import { useLiveActions } from "@/lib/db/react/data-runtime"
import type { DataState } from "@/lib/db/react/data-state"
import type { BoardAction } from "@/lib/contracts/alliance-board"
import { haptic } from "@/lib/haptics"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/scout/alliance-selection"
)({
  validateSearch: z.object({
    view: z.enum(["live", "sim"]).optional().catch(undefined),
    simId: z.string().max(40).optional().catch(undefined),
    sheet: z.enum(["record", "history"]).optional().catch(undefined),
    seed: z.coerce.number().int().min(1).max(8).optional().catch(undefined),
  }),
  component: AllianceSelection,
})

function AllianceSelection() {
  const { event, session } = Route.useRouteContext()
  // the live board is immersive: Back is the way out (FX-11)
  useHideTabBar()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const toast = useToast()
  const online = useOnline()
  const live = useLiveActions()
  const boardState = useAllianceBoard(event.key)
  const ranked = useRankedTeams(event.key)
  const followed = useFollowedOrder(event.key)
  const nicknames = useNicknames(event.key)
  const sims = useSims(event.key)
  const simWrites = useSimWrites(event.key)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changed, setChanged] = useState<number | null>(null)
  const view = search.view ?? "live"
  const sim = sims.find((s) => s.id === search.simId) ?? sims[0]
  const board = boardState.status === "success" ? boardState.data : null
  const actorIds = board?.history.map((h) => h.actorId) ?? []
  const names = useUserNames(actorIds)

  const liveModel: DataState<BoardViewModel> =
    boardState.status !== "success"
      ? boardState.status === "missing" &&
        boardState.reason === "not-found" &&
        ranked.length === 0
        ? { status: "missing", reason: "not-found" }
        : boardState
      : boardState.data.status === "notStarted"
        ? { status: "idle" }
        : {
            status: "success",
            data: {
              board: {
                alliances: boardState.data.alliances,
                declined: boardState.data.declined,
              },
              status: boardState.data.status,
              locked: boardState.data.locked,
            },
          }
  const simModel: DataState<BoardViewModel> =
    ranked.length === 0
      ? { status: "missing", reason: "not-found" }
      : {
          status: "success",
          data: {
            board: replay(ranked, sim?.actions ?? []),
            status: "inProgress",
            locked: false,
          },
        }
  const model = view === "live" ? liveModel : simModel
  const current = model.status === "success" ? model.data.board : null

  const mayRecord = can(session, "alliance-board:record", {
    locked: board?.locked ?? false,
  })
  const canRecord = view === "sim" ? true : mayRecord && online
  const recordHint =
    view === "sim"
      ? null
      : !can(session, "alliance-board:record", { locked: false })
        ? null
        : !mayRecord
          ? "The board is locked"
          : !online
            ? "Connect to record picks"
            : null

  const order = followed ?? ranked
  const candidates = current
    ? pickableFor(current, search.seed ?? 1, [
        ...order,
        ...ranked.filter((t) => !order.includes(t)),
      ]).map((t) => ({
        teamNumber: t,
        nickname: nicknames.get(t) ?? "",
      }))
    : []

  const setSheet = (sheet: "record" | "history" | undefined, seed?: number) =>
    void navigate({
      search: (p) => ({ ...p, sheet, seed }),
      replace: sheet === undefined,
    })

  const send = async (action: BoardAction) => {
    if (!board) return
    setBusy(true)
    setError(null)
    const r = await live.boardAction(event.key, board.rev, action)
    setBusy(false)
    switch (r.kind) {
      case "ok":
        haptic("success")
        if (action.kind === "pick") setChanged(action.seed)
        setSheet(undefined)
        return
      case "already":
        haptic("success")
        toast.show({
          title: `Already recorded by ${r.actorId ? (names.get(r.actorId) ?? "someone") : "someone"}`,
        })
        setSheet(undefined)
        return
      case "conflict":
        setError("Someone else updated the board. Check it and try again.")
        return
      case "offline":
        haptic("error")
        setError("You’re offline, the pick wasn’t recorded")
        return
      case "forbidden":
        setError("You can’t record picks right now")
        return
      case "error":
        setError("Couldn’t record the pick. Try again.")
    }
  }

  const sendSim = async (action: LocalAction) => {
    let target = sim
    target ??= await simWrites.create("My Sim")
    const next = [...target.actions, action]
    const r = applyAction(replay(ranked, target.actions), action, ranked)
    if (!r.ok) {
      setError("That team can’t be picked here")
      return
    }
    await simWrites.setActions(target.id, next)
    haptic("selection")
    setSheet(undefined)
  }

  const history = useMemo(() => {
    if (view === "sim")
      return [...(sim?.actions ?? [])]
        .map((a, i) => ({
          id: String(i),
          text:
            a.kind === "pick"
              ? `Picked ${a.team} for Alliance ${a.seed}`
              : `${a.team} declined`,
          at: sim?.createdAt ?? 0,
          canUndo: i === (sim?.actions.length ?? 0) - 1,
        }))
        .reverse()
    const mine = board?.history
      .filter((h) => h.actorId === session.userId)
      .at(-1)
    return [...(board?.history ?? [])].reverse().map((h) => ({
      id: h.id,
      text: `${names.get(h.actorId) ?? "Someone"} ${h.kind === "pick" ? `picked ${h.team ?? ""} for Alliance ${h.seed ?? ""}` : h.kind === "decline" ? `marked ${h.team ?? ""} declined` : h.kind}`,
      at: h.at,
      canUndo:
        online &&
        (can(session, "alliance-board:undo-any") || h.id === mine?.id),
    }))
  }, [view, sim, board, names, session, online])

  const forkFromLive = async () => {
    if (!board) return
    const actions: Array<LocalAction> = [
      ...board.declined.map((team): LocalAction => ({ kind: "decline", team })),
      ...board.alliances.flatMap((a) =>
        a.picks.map((team): LocalAction => ({
          kind: "pick",
          seed: a.seed,
          team,
        }))
      ),
    ]
    const s = await simWrites.create("From Live", actions)
    void navigate({
      search: (p) => ({ ...p, view: "sim", simId: s.id }),
      replace: true,
    })
  }

  return (
    <StackPage
      title="Alliance Selection"
      leading={<NavBackButton parentHref="/scout" label="Scout" />}
      trailing={
        <ActionMenu
          trigger={<Ellipsis aria-hidden size={22} />}
          actions={[
            { label: "History", onSelect: () => setSheet("history") },
            ...(view === "live" && board
              ? [{ label: "Fork to Sim", onSelect: () => void forkFromLive() }]
              : []),
            ...(view === "live" && board && can(session, "alliance-board:lock")
              ? [
                  {
                    label: board.locked ? "Unlock Board" : "Lock Board",
                    onSelect: () =>
                      void send({ kind: board.locked ? "unlock" : "lock" }),
                  },
                ]
              : []),
            ...(view === "sim" && sim
              ? [
                  {
                    label: "Reset Sim",
                    destructive: true,
                    onSelect: () => void simWrites.setActions(sim.id, []),
                  },
                ]
              : []),
          ]}
        />
      }
    >
      <div className="mb-3">
        <Segmented
          label="Board"
          value={view}
          onValueChange={(v) =>
            void navigate({
              search: (p) => ({ ...p, view: v === "live" ? undefined : v }),
              replace: true,
            })
          }
          options={[
            { value: "live", label: "Live" },
            { value: "sim", label: "My Sim" },
          ]}
        />
      </div>
      <BoardView
        state={model}
        canRecord={canRecord}
        recordHint={recordHint}
        changedSeed={changed}
        onRecord={(seed) => {
          setError(null)
          setSheet("record", seed)
        }}
      />
      <RecordSheet
        seed={search.sheet === "record" ? (search.seed ?? null) : null}
        onOpenChange={(open) => {
          if (!open) setSheet(undefined)
        }}
        candidates={candidates}
        busy={busy}
        error={error}
        onPick={(team) => {
          const seed = search.seed ?? 1
          void (view === "sim"
            ? sendSim({ kind: "pick", seed, team })
            : send({ kind: "pick", seed, team }))
        }}
        onDecline={(team) =>
          void (view === "sim"
            ? sendSim({ kind: "decline", team })
            : send({ kind: "decline", team }))
        }
      />
      <HistorySheet
        open={search.sheet === "history"}
        onOpenChange={(open) => {
          if (!open) setSheet(undefined)
        }}
        items={history}
        onUndo={(id) => {
          if (view === "sim" && sim)
            void simWrites.setActions(sim.id, sim.actions.slice(0, -1))
          else void send({ kind: "undo", actionId: id })
        }}
      />
    </StackPage>
  )
}
