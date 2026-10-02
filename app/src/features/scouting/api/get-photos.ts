// Robot photo tiles in the pit form: the local copy while it uploads, with its upload state
// (scouting-forms.md data states "Photo upload tile").
import { useCallback, useEffect, useMemo } from "react"
import { useDataRuntime, useWriter } from "@/lib/db/react/data-runtime"
import { useLiveOr } from "@/lib/db/react/data-state-hooks"
import { addRobotPhoto } from "@/lib/sync/media-writes"
import { recordKey } from "@/lib/sync/entity-registry"

export type PhotoState = "waiting" | "uploading" | "done" | "failed" | "missing"

export interface PhotoTile {
  id: string
  blob: Blob | null
  url: string | null
  state: PhotoState
}

export function usePhotoTiles(
  ids: ReadonlyArray<string>
): ReadonlyArray<PhotoTile> {
  const { db } = useDataRuntime()
  const key = ids.join(",")
  const rows = useLiveOr(
    async () => {
      const [uploads, assets, ops] = await Promise.all([
        db.mediaUploads.bulkGet([...ids]),
        db.mediaAssets.bulkGet([...ids]),
        db.outbox
          .where("recordKey")
          .anyOf(ids.map((id) => recordKey("mediaAsset", id)))
          .toArray(),
      ])
      return ids.map((id, i) => {
        const up = uploads[i]
        const asset = assets[i]
        const op = ops.find((o) => o.recordId === id)
        const state: PhotoState =
          up?.uploadState === "done" || (!up && asset)
            ? "done"
            : op?.state === "failed" || up?.uploadState === "failed"
              ? "failed"
              : op?.state === "inflight"
                ? "uploading"
                : up
                  ? "waiting"
                  : "missing"
        return {
          id,
          blob: up?.blob ?? null,
          remote: asset?.thumbUrl ?? asset?.url ?? null,
          state,
        }
      })
    },
    [key],
    [] as Array<{
      id: string
      blob: Blob | null
      remote: string | null
      state: PhotoState
    }>
  )
  // object URLs for local blobs, revoked when they're replaced
  const urls = useMemo(() => {
    const next = new Map<string, string>()
    for (const r of rows)
      if (r.blob) next.set(r.id, URL.createObjectURL(r.blob))
    return next
  }, [rows])
  useEffect(
    () => () => {
      for (const u of urls.values()) URL.revokeObjectURL(u)
    },
    [urls]
  )
  return useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        blob: r.blob,
        url: urls.get(r.id) ?? r.remote,
        state: r.state,
      })),
    [rows, urls]
  )
}

export function useAddPhoto(target: {
  eventKey: string
  teamNumber: number
  ownerRecordId: string
}) {
  const writer = useWriter()
  const { eventKey, teamNumber, ownerRecordId } = target
  return useCallback(
    (file: Blob) =>
      addRobotPhoto(writer, { eventKey, teamNumber, ownerRecordId, file }),
    [writer, eventKey, teamNumber, ownerRecordId]
  )
}

/** "Upload failed. Tap to retry.": put the op back in the queue now. */
export function useRetryPhoto() {
  const writer = useWriter()
  return useCallback(
    async (id: string) => {
      await writer.db.outbox
        .where("recordKey")
        .equals(recordKey("mediaAsset", id))
        .modify({ state: "queued", nextAttemptAt: writer.clock.now() })
      await writer.db.mediaUploads.update(id, { uploadState: "pending" })
      writer.onWrite?.()
    },
    [writer]
  )
}
