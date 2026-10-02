import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

describe("dom test project", () => {
  it("renders React with jest-dom matchers and IndexedDB available", () => {
    render(<button type="button">Sync now</button>)
    expect(screen.getByRole("button", { name: "Sync now" })).toBeVisible()
    expect(globalThis.indexedDB).toBeDefined()
  })
})
