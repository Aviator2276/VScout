import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { LoginError } from "@/lib/auth/auth-client"
import { LoginScreen } from "../components/login-screen"
import type { LoginScreenProps } from "../components/login-screen"

function Harness(p: Partial<LoginScreenProps>) {
  const [guestOpen, setGuestOpen] = useState(false)
  return (
    <App theme="ios">
      <LoginScreen
        online
        guestLogin
        guestOpen={guestOpen}
        onGuestOpenChange={setGuestOpen}
        onSignIn={() => Promise.resolve()}
        onJoinAsGuest={() => Promise.resolve()}
        {...p}
      />
    </App>
  )
}

describe("sign in", () => {
  it("submits trimmed credentials once both are filled", async () => {
    const onSignIn = vi.fn(() => Promise.resolve())
    render(<Harness onSignIn={onSignIn} />)
    const button = screen.getByRole("button", { name: "Sign In" })
    expect(button).toBeDisabled()
    await userEvent.type(screen.getByLabelText("Username"), " alex ")
    await userEvent.type(
      screen.getByLabelText("Password"),
      "correct horse 42{Enter}"
    )
    expect(onSignIn).toHaveBeenCalledWith("alex", "correct horse 42")
  })

  it("explains a failed sign-in and lets you try again", async () => {
    const onSignIn = vi.fn(() =>
      Promise.reject(new LoginError("invalid_credentials"))
    )
    render(<Harness onSignIn={onSignIn} defaultUsername="alex" />)
    expect(screen.getByLabelText("Username")).toHaveValue("alex")
    await userEvent.type(screen.getByLabelText("Password"), "nope")
    await userEvent.click(screen.getByRole("button", { name: "Sign In" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/don't match/)
    expect(screen.getByRole("button", { name: "Sign In" })).toBeEnabled()
    onSignIn.mockImplementationOnce(() => Promise.reject(new Error("boom")))
    await userEvent.click(screen.getByRole("button", { name: "Sign In" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Couldn't sign in/
    )
  })

  it("is disabled offline with the reason as text", () => {
    render(<Harness online={false} />)
    expect(
      screen.getByText("Signing in needs a connection.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Continue as Guest" })
    ).toBeDisabled()
  })

  it("says why a forced logout happened", () => {
    render(<Harness endedReason="guest_code_rotated" />)
    expect(screen.getByRole("status")).toHaveTextContent(/guest code changed/)
  })

  it("hides guest sign-in when the backend doesn't support it", () => {
    render(<Harness guestLogin={false} />)
    expect(
      screen.queryByRole("button", { name: "Continue as Guest" })
    ).toBeNull()
  })
})

describe("guest code (ui-patterns §9B)", () => {
  it("opens one labelled field, cleans typing and joins at 6 characters", async () => {
    const onJoin = vi.fn(() => Promise.resolve())
    render(<Harness onJoinAsGuest={onJoin} />)
    await userEvent.click(
      screen.getByRole("button", { name: "Continue as Guest" })
    )
    expect(screen.queryByLabelText("Password")).toBeNull()
    const field = screen.getByLabelText("Guest Code")
    expect(field).toHaveAttribute("autocomplete", "one-time-code")
    await userEvent.type(field, "k7m-2q")
    expect(field).toHaveValue("K7M2Q")
    expect(screen.getByRole("button", { name: "Join as Guest" })).toBeDisabled()
    await userEvent.type(field, "0")
    expect(field).toHaveAccessibleDescription("Codes don't use 0, O, 1 or I.")
    await userEvent.type(field, "x")
    await userEvent.click(screen.getByRole("button", { name: "Join as Guest" }))
    expect(onJoin).toHaveBeenCalledWith("K7M2QX")
  })

  it("joins right away when a full code is pasted, and shows errors inline", async () => {
    const onJoin = vi.fn(() =>
      Promise.reject(new LoginError("invalid_guest_code"))
    )
    render(<Harness onJoinAsGuest={onJoin} />)
    await userEvent.click(
      screen.getByRole("button", { name: "Continue as Guest" })
    )
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Guest Code"), {
        target: { value: "k7m 2qx" },
      })
      await Promise.resolve()
    })
    expect(onJoin).toHaveBeenCalledWith("K7M2QX")
    expect(await screen.findByText(/didn't work/)).toBeInTheDocument()
    expect(screen.getByLabelText("Guest Code")).toHaveValue("K7M2QX")
    onJoin.mockImplementationOnce(() => Promise.reject(new Error("x")))
    await userEvent.click(screen.getByRole("button", { name: "Join as Guest" }))
    expect(await screen.findByText(/Couldn't sign in/)).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: "Sign In with an Account" })
    )
    expect(screen.getByLabelText("Password")).toBeInTheDocument()
  })
})
