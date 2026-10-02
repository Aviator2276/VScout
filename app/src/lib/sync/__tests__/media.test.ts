import { beforeEach, describe, expect, it } from "vitest"
import { setupEngine } from "@/testing/engine"
import { TEST_GAME } from "@/testing/factories/wire"
import { mockBackend } from "@/testing/mocks/mock-backend"
import { addRobotPhoto, pendingPhotoKeys } from "../media-writes"
import { createRecord } from "../mutate"

beforeEach(() => mockBackend.reset())

const identity = (b: Blob) => Promise.resolve(b)

describe("robot photos (ADR-036, scouting-forms criterion 19)", () => {
  it.each(["http", "mqtt"] as const)(
    "uploads over HTTP before the pit entry that references it (%s mode)",
    async (transport) => {
      const t = setupEngine({ transport })
      const blob = new Blob(["jpeg-bytes"], { type: "image/jpeg" })
      const photoId = await addRobotPhoto(
        t.mutateDeps,
        {
          eventKey: "2026casj",
          teamNumber: 254,
          ownerRecordId: "pit-1",
          file: blob,
        },
        identity
      )
      expect(await t.db.mediaUploads.get(photoId)).toMatchObject({
        uploadState: "pending",
      })
      const dependsOn = await pendingPhotoKeys(t.mutateDeps, [photoId])
      await createRecord(
        t.mutateDeps,
        "pitScouting",
        {
          eventKey: "2026casj",
          gameId: TEST_GAME,
          schemaVersion: 2,
          data: {},
          teamNumber: 254,
          robot: { drivetrain: "swerve" },
          photos: [photoId],
        },
        { dependsOn }
      )
      expect(await t.engine.syncNow("manual")).toMatchObject({ outcome: "ok" })
      // the server would answer 422 media_missing if the entry went first
      expect(mockBackend.records.has(`mediaAsset:${photoId}`)).toBe(true)
      expect(
        [...mockBackend.records.keys()].some((k) =>
          k.startsWith("pitScouting:")
        )
      ).toBe(true)
      expect(await t.db.outbox.count()).toBe(0)
      expect(await t.db.mediaUploads.get(photoId)).toMatchObject({
        uploadState: "done",
      })
      expect(await t.db.mediaAssets.get(photoId)).toMatchObject({
        teamNumber: 254,
        url: `https://media.example/${photoId}.jpg`,
      })
      t.engine.stop()
    }
  )

  it("a photo already uploaded adds no dependency", async () => {
    const t = setupEngine()
    const id = await addRobotPhoto(
      t.mutateDeps,
      {
        eventKey: "2026casj",
        teamNumber: 1,
        ownerRecordId: "x",
        file: new Blob(["a"]),
      },
      identity
    )
    await t.db.mediaUploads.update(id, { uploadState: "done" })
    expect(await pendingPhotoKeys(t.mutateDeps, [id])).toEqual([])
  })
})
