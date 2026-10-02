// Is the browser online? (pwa-offline §15). `navigator.onLine` only knows about the network
// interface, so "online" means "worth trying"; requests still handle failure.
type Targets = Pick<Window, "addEventListener" | "removeEventListener">

export function createOnlineStore(
  target: Targets | undefined,
  read: () => boolean
) {
  return {
    getSnapshot: read,
    /** the shell prerender has no network: assume online */
    getServerSnapshot: () => true,
    subscribe(listener: () => void) {
      target?.addEventListener("online", listener)
      target?.addEventListener("offline", listener)
      return () => {
        target?.removeEventListener("online", listener)
        target?.removeEventListener("offline", listener)
      }
    },
  }
}

export const onlineStore = createOnlineStore(
  typeof window === "undefined" ? undefined : window,
  () => (typeof navigator === "undefined" ? true : navigator.onLine)
)
