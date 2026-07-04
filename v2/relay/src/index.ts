import { buildRelayApp } from './app'

const PORT = Number(process.env.PORT ?? 4100)
const HOST = process.env.HOST ?? '0.0.0.0'

async function main() {
  const app = await buildRelayApp()
  await app.listen({ port: PORT, host: HOST })
  app.log.info(`Punters relay on http://localhost:${PORT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
