import { buildApp } from './app'

async function start() {
  try {
    const { app, config } = await buildApp()
    await app.listen({ port: config.port, host: config.host })
    app.log.info({ port: config.port, host: config.host }, 'Server ready')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err)
    process.exit(1)
  }
}

start()
