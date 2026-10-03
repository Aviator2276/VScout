import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TermFigure } from "../components/term-figure"

const image = {
  src: "/f.svg",
  srcDark: "/f.dark.svg",
  alt: "A red robot pins a blue robot",
  animated: true,
}

function reduceMotion(on: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: on && q.includes("reduced-motion"),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

afterEach(() => vi.unstubAllGlobals())

describe("TermFigure", () => {
  it("renders the light and dark artwork with the same alt text", () => {
    reduceMotion(false)
    render(<TermFigure image={image} />)
    const imgs = screen.getAllByAltText(image.alt)
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual([
      "/f.svg",
      "/f.dark.svg",
    ])
  })

  it("replays with a new URL, so WebKit restarts the animation", () => {
    reduceMotion(false)
    render(<TermFigure image={image} />)
    fireEvent.click(screen.getByRole("button", { name: "Replay animation" }))
    expect(screen.getAllByAltText(image.alt)[0]).toHaveAttribute(
      "src",
      "/f.svg#play=1"
    )
  })

  it("shows the key frame and no Replay with Reduce Motion on", () => {
    reduceMotion(true)
    render(<TermFigure image={image} />)
    expect(screen.getAllByAltText(image.alt)[1]).toHaveAttribute(
      "src",
      "/f.dark.svg#still"
    )
    expect(
      screen.queryByRole("button", { name: "Replay animation" })
    ).toBeNull()
  })
})
