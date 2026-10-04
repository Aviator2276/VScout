// P4 the picklist vote (scout-tab.md A.2, ADR-080). Everyone marks one of their own lists as their vote
// for first pick and for second pick; the list's order is their ranked ballot. The results rank every
// team by repeated instant runoff, flag do-not-pick teams, and show where each voter put a team. An
// admin builds the master list from the results, team by team or all at once; the master list takes
// priority over every other list.
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { Segmented } from "@/components/controls/segmented"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import {
  Check,
  CircleCheck,
  ListOrdered,
  Plus,
  TriangleAlert,
} from "@/components/icons/icon"
import { List } from "@/components/list/list"
import { cn } from "@/lib/utils"
import type { VoteData, VotePurpose } from "../api/get-vote"
import type { VoteRow } from "../utils/ranked-choice"

const PURPOSE_NAME: Record<VotePurpose, string> = {
  first: "first pick",
  second: "second pick",
}

export function VoteView({
  purpose,
  onPurposeChange,
  data,
  canVote,
  canBuild,
  onVote,
  onAdd,
}: {
  purpose: VotePurpose
  onPurposeChange: (p: VotePurpose) => void
  /** null while loading */
  data: VoteData | null
  /** scouters and admins vote with their own lists */
  canVote: boolean
  /** admins build the master list */
  canBuild: boolean
  onVote: (listId: string | null) => void
  onAdd: (teams: ReadonlyArray<number>) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Segmented
        label="Vote"
        value={purpose}
        onValueChange={onPurposeChange}
        options={[
          { value: "first", label: "First Pick" },
          { value: "second", label: "Second Pick" },
        ]}
      />
      {data === null ? (
        <div role="status" aria-label="Loading the vote…">
          <SkeletonRows rows={6} rowClassName="h-16" />
        </div>
      ) : (
        <>
          {canVote ? (
            <YourVote purpose={purpose} data={data} onVote={onVote} />
          ) : null}
          <MasterSection purpose={purpose} data={data} canBuild={canBuild} />
          <Results
            purpose={purpose}
            data={data}
            canBuild={canBuild}
            onAdd={onAdd}
          />
        </>
      )}
    </div>
  )
}

function YourVote({
  purpose,
  data,
  onVote,
}: {
  purpose: VotePurpose
  data: VoteData
  onVote: (listId: string | null) => void
}) {
  const check = <Check aria-label="Your vote" size={18} />
  return (
    <List.Section
      title="Your Vote"
      footer={
        data.mine.length === 0
          ? `Make a ${PURPOSE_NAME[purpose]} list, best team first, to vote.`
          : "Your list’s order is your ballot. Edit the list and your vote follows it."
      }
    >
      {data.mine.length === 0 ? (
        <List.Row
          title={`New ${purpose === "first" ? "First" : "Second"} Pick List`}
          href="/scout/picklists?sheet=new"
        />
      ) : (
        <>
          {data.mine.map((l) => (
            <List.Row
              key={l.id}
              title={l.name}
              subtitle={`${l.teamCount} ${l.teamCount === 1 ? "team" : "teams"}`}
              detail={data.myBallot === l.id ? check : undefined}
              onSelect={() => onVote(l.id)}
            />
          ))}
          <List.Row
            title="Don’t Vote"
            detail={data.myBallot === null ? check : undefined}
            onSelect={() => onVote(null)}
          />
        </>
      )}
    </List.Section>
  )
}

function MasterSection({
  purpose,
  data,
  canBuild,
}: {
  purpose: VotePurpose
  data: VoteData
  canBuild: boolean
}) {
  const m = data.master
  return (
    <List.Section
      title="Master List"
      footer={
        m
          ? purpose === "first"
            ? "The team follows this list. It shows above every other list, and alliance selection uses it."
            : "It shows above every other list."
          : canBuild
            ? "Add teams from the results below to start it."
            : "An admin builds it from the results."
      }
    >
      {m ? (
        <List.Row
          title={m.name}
          detail={`${m.rows.length} ${m.rows.length === 1 ? "team" : "teams"}`}
          href={`/scout/picklists/${m.id}`}
        />
      ) : (
        <List.Row title="Not started yet" />
      )}
    </List.Section>
  )
}

function Results({
  purpose,
  data,
  canBuild,
  onAdd,
}: {
  purpose: VotePurpose
  data: VoteData
  canBuild: boolean
  onAdd: (teams: ReadonlyArray<number>) => void
}) {
  const [open, setOpen] = useState<number | null>(null)
  const inMaster = new Map(
    (data.master?.rows ?? []).map((r, i) => [r.teamNumber, i + 1])
  )
  const missing = data.rows
    .filter((r) => !inMaster.has(r.teamNumber) && r.dnp === 0)
    .map((r) => r.teamNumber)
  const n = data.ballots.length
  return (
    <section aria-labelledby="vote-results" className="mt-6">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-4">
        <h2
          id="vote-results"
          className="text-footnote text-muted-foreground uppercase"
        >
          Results
        </h2>
        <span className="text-footnote text-muted-foreground">
          {n} {n === 1 ? "ballot" : "ballots"}
        </span>
      </div>
      {data.rows.length === 0 ? (
        <div
          role="status"
          className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-10 text-center text-muted-foreground"
        >
          <ListOrdered aria-hidden size={40} />
          <p className="text-headline text-foreground">No votes yet</p>
          <p className="text-subhead">
            Results appear when someone marks a {PURPOSE_NAME[purpose]} list as
            their vote.
          </p>
        </div>
      ) : (
        <>
          <ol aria-label="Vote results" className="flex flex-col gap-2">
            {data.rows.map((r) => (
              <ResultRow
                key={r.teamNumber}
                row={r}
                nickname={data.nicknames.get(r.teamNumber) ?? ""}
                ballots={n}
                voters={data.ballots}
                expanded={open === r.teamNumber}
                onToggle={() =>
                  setOpen(open === r.teamNumber ? null : r.teamNumber)
                }
                masterPosition={inMaster.get(r.teamNumber) ?? null}
                onAdd={canBuild ? () => onAdd([r.teamNumber]) : undefined}
              />
            ))}
          </ol>
          <p className="mt-1.5 px-4 text-footnote text-muted-foreground">
            Ranked choice: each place goes to the team that wins an instant
            runoff among the teams left. Do-not-pick doesn’t change the order;
            it’s flagged for whoever builds the master list.
          </p>
          {canBuild && missing.length > 0 ? (
            <Button
              size="large"
              variant="secondary"
              className="mt-3"
              onClick={() => onAdd(missing)}
            >
              {data.master
                ? `Add ${missing.length} More to Master`
                : `Start Master With All ${missing.length}`}
            </Button>
          ) : null}
        </>
      )}
    </section>
  )
}

function ResultRow({
  row: r,
  nickname,
  ballots,
  voters,
  expanded,
  onToggle,
  masterPosition,
  onAdd,
}: {
  row: VoteRow
  nickname: string
  ballots: number
  voters: ReadonlyArray<{ userId: string; voter: string }>
  expanded: boolean
  onToggle: () => void
  masterPosition: number | null
  onAdd: (() => void) | undefined
}) {
  const where = new Map(r.positions.map((p) => [p.voter, p.position]))
  const detailId = `vote-${r.teamNumber}`
  return (
    <li
      className={cn(
        "rounded-2xl bg-card shadow-xs",
        r.dnp > 0 && "ring-1 ring-destructive/40"
      )}
    >
      <div className="flex items-center gap-1 pe-1">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={onToggle}
          className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl py-2 ps-3 text-left active:bg-muted"
        >
          <span className="w-6 font-heading text-subhead text-muted-foreground tabular-nums">
            {r.position}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-2">
              <span className="font-heading text-headline tabular-nums">
                {r.teamNumber}
              </span>
              <span className="min-w-0 truncate text-subhead">{nickname}</span>
            </span>
            <span className="text-footnote text-muted-foreground tabular-nums">
              {r.round === 1 ? "Majority" : "Runoff"} · {r.votes} of {r.of}{" "}
              {r.of === 1 ? "vote" : "votes"} · on {r.ballots} of {ballots}{" "}
              {ballots === 1 ? "list" : "lists"}
            </span>
          </span>
          {r.dnp > 0 ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/12 px-2 py-0.5 text-caption-1 font-semibold text-destructive">
              <TriangleAlert aria-hidden size={12} />
              DNP {r.dnp}
              <span className="sr-only">
                : on {r.dnp} {r.dnp === 1 ? "person’s" : "people’s"} do-not-pick
                list
              </span>
            </span>
          ) : null}
        </button>
        {masterPosition !== null ? (
          <span
            className="flex size-11 shrink-0 items-center justify-center text-success"
            title={`#${masterPosition} on the master list`}
          >
            <CircleCheck
              aria-label={`${r.teamNumber} is number ${masterPosition} on the master list`}
              size={22}
            />
          </span>
        ) : onAdd ? (
          <button
            type="button"
            aria-label={`Add ${r.teamNumber} to the master list`}
            onClick={onAdd}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-primary active:bg-muted"
          >
            <Plus aria-hidden size={22} />
          </button>
        ) : null}
      </div>
      {expanded ? (
        <ul
          id={detailId}
          aria-label={`Where each voter put ${r.teamNumber}`}
          className="flex flex-wrap gap-x-3 gap-y-1 ps-12 pe-3 pb-3 text-footnote"
        >
          {voters.map((v) => {
            const p = where.get(v.userId)
            return (
              <li key={v.userId} className={cn(!p && "text-muted-foreground")}>
                <span className="font-semibold">{v.voter}</span>{" "}
                <span className="tabular-nums">{p ? `#${p}` : "—"}</span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </li>
  )
}
