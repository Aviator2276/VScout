// The access token lives in memory only (routing-auth §7.1): lost on reload, refreshed on boot.
export interface TokenStore {
  get: () => string | null
  /** epoch ms the token expires, or 0 */
  expiresAt: () => number
  set: (token: string, expiresAt: number) => void
  clear: () => void
  subscribe: (listener: () => void) => () => void
}

export function createTokenStore(): TokenStore {
  let token: string | null = null
  let exp = 0
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const l of listeners) l()
  }
  return {
    get: () => token,
    expiresAt: () => exp,
    set(next, expiresAt) {
      token = next
      exp = expiresAt
      emit()
    },
    clear() {
      token = null
      exp = 0
      emit()
    },
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}
