import Fastify from 'fastify'
import { SignJWT, exportJWK, type KeyLike } from 'jose'

/**
 * A stand-in for the relay's session-JWKS endpoint, so server tests can verify a real
 * signed session cookie without depending on the relay workspace or a live deployment.
 * The relay's own auth chain (login, binding, sync) is tested in relay/tests.
 */
export async function buildFakeRelay(privateKey: KeyLike, publicKey: KeyLike, kid: string) {
  const app = Fastify({ logger: false })
  app.get('/relay/.well-known/jwks.json', async () => ({
    keys: [{ ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' }],
  }))
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  async function mintSessionToken(sub: string, email: string): Promise<string> {
    return new SignJWT({ email })
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(privateKey)
  }

  return { app, url: `http://127.0.0.1:${port}`, mintSessionToken }
}
