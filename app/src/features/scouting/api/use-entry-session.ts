// Opening a scouting form (scouting-forms.md "Drafts, edit, delete, offline"). Decides once per
// open: my existing entry → edit mode; my draft for the same robot → resume; else a new draft whose
// id is the future record id. Autosave writes the draft; submit is one transaction (mutate.ts).
import { useCallback, useEffect, useState } from "react"
import type { FormContext } from "@/games/kit/fields"
import { formOf } from "@/games/kit/fields"
import { draftSchema } from "@/games/kit/schema"
import type { GameDefinition } from "@/games/types"
import { openDraft, saveDraft } from "@/lib/db/drafts"
import { useWriter } from "@/lib/db/react/data-runtime"
import type {
  DraftRow,
  PitScoutingRecord,
  PostScoutingRecord,
  ScoutEntryRecord,
} from "@/lib/db/types"
import { toAppError } from "@/lib/errors"
import type { AppError } from "@/lib/errors"
import { pendingPhotoKeys } from "@/lib/sync/media-writes"
import { createRecord, updateRecord } from "@/lib/sync/mutate"
import type { EntryValues } from "../utils/form-values"

export type EntryKind = "match" | "pit" | "post"

export interface EntryTarget {
  kind: EntryKind
  eventKey: string
  teamNumber: number
  /** match forms only */
  matchKey?: string
  station?: string
  ctx: FormContext
  /** false when scouting is closed for this user: only an existing entry opens (criterion 18) */
  allowNew: boolean
}

type OwnedRecord = ScoutEntryRecord | PitScoutingRecord | PostScoutingRecord

/** Extra non-game values a form carries alongside `data` (the pit form's robot profile). */
export type ExtraValues = Record<string, unknown>

export interface SessionValues extends EntryValues {
  extra?: ExtraValues
}

export type EntrySession =
  | { status: "loading" }
  | { status: "closed" }
  | { status: "error"; error: AppError; retry: () => void }
  /** a draft that no longer fits the form: shown, kept until the user starts over */
  | { status: "corrupt"; draft: DraftRow; startOver: () => Promise<void> }
  | {
      status: "ready"
      mode: "new" | "resume" | "edit"
      /** the id the record has (edit) or will have (new) */
      recordId: string
      initial: SessionValues
      stage: string | undefined
      resumedAt: number | null
      /** the draft was migrated and flagged for review (game-module §6) */
      needsReview: boolean
      autosave: (values: SessionValues, stage?: string) => void
      submit: (values: SessionValues) => Promise<OwnedRecord>
      startOver: () => Promise<void>
    }

const TABLE = {
  match: "scoutEntries",
  pit: "pitScouting",
  post: "postScouting",
} as const
const ENTITY = {
  match: "scoutEntry",
  pit: "pitScouting",
  post: "postScouting",
} as const

function tagsList(tags: EntryValues["tags"]): Array<string> {
  return [...new Set(Object.values(tags).flat())]
}

export function useEntrySession(
  game: GameDefinition,
  target: EntryTarget
): EntrySession {
  const writer = useWriter()
  const [state, setState] = useState<EntrySession>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    setState({ status: "loading" })
    setAttempt((a) => a + 1)
  }, [])
  const { kind, eventKey, teamNumber, matchKey, station, ctx, allowNew } =
    target

  useEffect(() => {
    let cancelled = false
    const { db } = writer
    const userId = writer.session()?.userId
    const form = formOf(game, kind)

    const build = async (): Promise<EntrySession> => {
      if (!userId) throw new Error("Sign in to scout")
      const table = db.table(TABLE[kind])
      const mine = (
        (await (
          kind === "match" && matchKey
            ? table
                .where("[matchKey+teamNumber]")
                .equals([matchKey, teamNumber])
            : table
                .where("[eventKey+teamNumber]")
                .equals([eventKey, teamNumber])
        ).toArray()) as Array<OwnedRecord>
      ).find((r) => r.authorId === userId)

      const submitNew = async (values: SessionValues, fromDraftId: string) => {
        const base = {
          eventKey,
          gameId: game.id,
          schemaVersion: game.schemaVersion,
          data: values.data,
          teamNumber,
        }
        if (kind === "match")
          return createRecord(
            writer,
            "scoutEntry",
            {
              ...base,
              matchKey: matchKey ?? "",
              station: (station ?? "red1") as ScoutEntryRecord["station"],
              scouterLevel: ctx.level,
              tags: tagsList(values.tags),
            },
            { fromDraftId }
          )
        if (kind === "pit") {
          const photos = (values.extra?.photos ?? []) as Array<string>
          // the entry waits for its photos' uploads (http-api-contract §5.2: 422 media_missing)
          const dependsOn = await pendingPhotoKeys(writer, photos)
          return createRecord(
            writer,
            "pitScouting",
            {
              ...base,
              robot: (values.extra?.robot ?? {
                drivetrain: "unknown",
              }) as PitScoutingRecord["robot"],
              photos,
            },
            { fromDraftId, ...(dependsOn.length ? { dependsOn } : {}) }
          )
        }
        return createRecord(writer, "postScouting", base, { fromDraftId })
      }

      if (mine) {
        // edit: the form opens on the record; a draft keyed by the record id appears on the first change
        const existing = await db.drafts.get(mine.id)
        const fromDraft = existing?.values as SessionValues | undefined
        const pit = mine as PitScoutingRecord
        const initial: SessionValues = fromDraft ?? {
          data: mine.data,
          tags: {},
          ...(kind === "pit"
            ? { extra: { robot: pit.robot, photos: pit.photos } }
            : {}),
        }
        return {
          status: "ready",
          mode: "edit",
          recordId: mine.id,
          initial,
          stage: existing?.stage,
          resumedAt: existing ? existing.updatedAt : null,
          needsReview: existing?.needsReview === true,
          autosave: (values, stage) => {
            void db.drafts.put({
              id: mine.id,
              userId,
              kind,
              eventKey,
              context: {
                teamNumber,
                ...(matchKey ? { matchKey } : {}),
                ...(station ? { station } : {}),
              },
              values: values as unknown as Record<string, unknown>,
              gameId: game.id,
              schemaVersion: game.schemaVersion,
              createdAt: existing?.createdAt ?? writer.clock.now(),
              updatedAt: writer.clock.now(),
              ...(stage ? { stage } : {}),
            })
          },
          submit: async (values) => {
            const dependsOn =
              kind === "pit"
                ? await pendingPhotoKeys(
                    writer,
                    (values.extra?.photos ?? []) as Array<string>
                  )
                : []
            const updated = await updateRecord(
              writer,
              ENTITY[kind],
              mine.id,
              (cur) => ({
                ...cur,
                data: values.data,
                schemaVersion: game.schemaVersion,
                ...(kind === "match" ? { tags: tagsList(values.tags) } : {}),
                ...(kind === "pit" && values.extra
                  ? { robot: values.extra.robot, photos: values.extra.photos }
                  : {}),
              }),
              { dependsOn }
            )
            await db.drafts.delete(mine.id)
            return updated
          },
          startOver: async () => {
            await db.drafts.delete(mine.id)
            retry()
          },
        }
      }

      const known = await db.drafts
        .where("[userId+kind]")
        .equals([userId, kind])
        .filter(
          (d) =>
            d.eventKey === eventKey &&
            d.context.teamNumber === teamNumber &&
            d.context.matchKey === matchKey
        )
        .first()
      if (!allowNew && !known) return { status: "closed" }
      const draft = await openDraft(
        db,
        {
          userId,
          kind,
          eventKey,
          context: {
            teamNumber,
            ...(matchKey ? { matchKey } : {}),
            ...(station ? { station } : {}),
          },
          gameId: game.id,
          schemaVersion: game.schemaVersion,
        },
        { now: writer.clock.now(), newId: writer.ids.newId }
      )
      const stored = draft.values as Partial<SessionValues>
      const resumed = Object.keys(stored).length > 0
      const startOver = async () => {
        await db.drafts.delete(draft.id)
        retry()
      }
      if (resumed) {
        const fits = draftSchema(game, form, ctx).safeParse(
          stored.data ?? {}
        ).success
        if (!fits && !draft.needsReview)
          return { status: "corrupt", draft, startOver }
      }
      return {
        status: "ready",
        mode: resumed ? "resume" : "new",
        recordId: draft.id,
        initial: {
          data: stored.data ?? {},
          tags: stored.tags ?? {},
          ...(stored.extra ? { extra: stored.extra } : {}),
        },
        stage: draft.stage,
        resumedAt: resumed ? draft.updatedAt : null,
        needsReview: draft.needsReview === true,
        autosave: (values, stage) =>
          void saveDraft(
            db,
            draft.id,
            values as unknown as Record<string, unknown>,
            writer.clock.now(),
            stage
          ),
        submit: (values) => submitNew(values, draft.id),
        startOver,
      }
    }

    build()
      .then((s) => {
        if (!cancelled) setState(s)
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({ status: "error", error: toAppError(error), retry })
      })
    return () => {
      cancelled = true
    }
    // the caller memoizes ctx (useMemo), so this runs once per open
  }, [
    writer,
    game,
    kind,
    eventKey,
    teamNumber,
    matchKey,
    station,
    ctx,
    allowNew,
    attempt,
    retry,
  ])

  return state
}
