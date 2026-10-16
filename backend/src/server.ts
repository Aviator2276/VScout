// Entry point: config → services → HTTP → MQTT (after HTTP is listening, REQUIREMENTS §9.8) → jobs.
import { buildApp } from "./app.js"
import { loadConfig } from "./config.js"
import { MqttConnection } from "./realtime/mqtt-link.js"
import { RpcServer } from "./realtime/rpc.js"
import { createServices } from "./services.js"

async function main() {
  const config = loadConfig()
  const s = createServices(config)
  const { app, ctx } = await buildApp(s)

  // first start: an admin account so someone can sign in and create the rest
  if (s.users.count() === 0) {
    const username = config.BOOTSTRAP_ADMIN_USERNAME ?? "admin"
    const { passphrase } = await s.users.create({
      username,
      displayName: "Admin",
      role: "admin",
      ...(config.BOOTSTRAP_ADMIN_PASSWORD ? { password: config.BOOTSTRAP_ADMIN_PASSWORD } : {}),
    })
    s.settings.userSettings(String(s.users.byUsername(username)?.id))
    if (config.BOOTSTRAP_ADMIN_PASSWORD) console.log(`[vscout] created admin account "${username}" with BOOTSTRAP_ADMIN_PASSWORD`)
    else console.log(`[vscout] created admin account "${username}" with passphrase: ${passphrase}  (shown once; change it after signing in)`)
  }
  for (const ek of config.TRACKED_EVENTS)
    if (!s.importer.trackedEvents().some((e) => e.eventKey === ek)) s.importer.track(ek, true)

  await app.listen({ port: config.PORT, host: config.HOST })

  let mqttConn: MqttConnection | null = null
  if (config.MQTT_URL) {
    const clientId = `vscout-api-${config.MQTT_INSTANCE_ID}`
    const rpc = new RpcServer(s.guard, (o) => app.inject(o), ctx.rpcSecret)
    mqttConn = new MqttConnection({
      url: config.MQTT_URL,
      clientId,
      username: config.MQTT_SERVICE_USERNAME,
      password: () => s.auth.serviceToken(config.MQTT_SERVICE_USERNAME, clientId),
      rpc,
      onConnect: () => s.publisher.publishStatus(),
      log: (m, e) => app.log.info({ err: e }, m),
    })
    s.publisher.attach(mqttConn)
    await mqttConn.start()
  } else app.log.warn("MQTT_URL not set: no live fan-out or RPC (clients still sync over HTTP and SSE)")

  s.scheduler.start()

  const shutdown = async (signal: string) => {
    app.log.info(`${signal}: shutting down`)
    s.scheduler.stop()
    s.publisher.stop()
    s.sse.closeAll()
    await mqttConn?.stop().catch(() => {})
    await app.close()
    s.db.close()
    process.exit(0)
  }
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
