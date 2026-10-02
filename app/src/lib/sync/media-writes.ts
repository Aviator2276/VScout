// Robot photos (ADR-036, http-api-contract §5.2). A photo is compressed on the device, kept in
// mediaUploads and uploaded through the outbox before the pit entry that references it (dependsOn),
// so it works offline and survives the app being killed.
import imageCompression from "browser-image-compression"
import type { MutateDeps } from "./mutate"
import { NotAllowedError } from "./errors"
import { enqueue } from "./outbox"
import { recordKey } from "./entity-registry"

export const PHOTO_MAX_PX = 1600

/** Compresses (~1600 px, JPEG) and queues the upload. Returns the new media id. */
export async function addRobotPhoto(
  deps: MutateDeps,
  input: {
    eventKey: string
    teamNumber: number
    ownerRecordId: string
    file: Blob
  },
  compress: (file: Blob) => Promise<Blob> = defaultCompress
): Promise<string> {
  const s = deps.session()
  if (!s) throw new NotAllowedError("Sign in to add photos")
  const blob = await compress(input.file)
  const id = deps.ids.newId()
  const now = deps.clock.now()
  const { db } = deps
  await db.transaction("rw", [db.mediaUploads, db.outbox], async () => {
    await db.mediaUploads.add({
      id,
      userId: s.userId,
      eventKey: input.eventKey,
      teamNumber: input.teamNumber,
      ownerRecordId: input.ownerRecordId,
      blob,
      mime: blob.type || "image/jpeg",
      uploadState: "pending",
      createdAt: now,
    })
    await enqueue(db, {
      opId: deps.ids.newId(),
      userId: s.userId,
      entity: "mediaAsset",
      recordId: id,
      eventKey: input.eventKey,
      kind: "upload",
      now,
    })
  })
  deps.onWrite?.()
  return id
}

/** The outbox keys a record must wait for: its photos that haven't uploaded yet. */
export async function pendingPhotoKeys(
  deps: Pick<MutateDeps, "db">,
  photoIds: ReadonlyArray<string>
): Promise<Array<string>> {
  if (photoIds.length === 0) return []
  const rows = await deps.db.mediaUploads.bulkGet([...photoIds])
  return rows
    .filter((r) => r !== undefined && r.uploadState !== "done")
    .map((r) => recordKey("mediaAsset", r?.id ?? ""))
}

async function defaultCompress(file: Blob): Promise<Blob> {
  const asFile =
    file instanceof File
      ? file
      : new File([file], "photo.jpg", { type: file.type })
  return imageCompression(asFile, {
    maxWidthOrHeight: PHOTO_MAX_PX,
    fileType: "image/jpeg",
    initialQuality: 0.8,
    useWebWorker: true,
  })
}
