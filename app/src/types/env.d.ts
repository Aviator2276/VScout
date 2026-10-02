// Build-time constants from scripts/build-defines.mjs. Read them via src/config/version.ts.
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
declare const __APP_BUILT_AT__: string

interface ImportMetaEnv {
  /** the backend API base, e.g. https://scout.example.org/api/v1 (default: same origin /api/v1) */
  readonly VITE_API_URL?: string
  /** the MQTT WebSocket URL (default: wss://<this host>/mqtt) */
  readonly VITE_MQTT_URL?: string
}
