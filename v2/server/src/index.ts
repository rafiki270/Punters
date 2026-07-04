import { buildApp } from './app'
import { attachSockets } from './core/sockets'

const PORT = Number(process.env.PORT ?? 4000)
const HOST = process.env.HOST ?? '0.0.0.0'

async function main() {
  const app = await buildApp()
  attachSockets(app)
  await app.listen({ port: PORT, host: HOST })
  app.log.info(`Punters v2 on http://localhost:${PORT} (display: / — admin: /admin)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
