import { importPKCS8, exportJWK, type KeyLike } from 'jose'

/**
 * Two independent RS256 keypairs, per the UOA integration guide's "two trust mechanisms"
 * principle applied one level down: one key signs the config JWT UOA verifies, the other
 * signs the relay's own venue-session tokens. Never share a kid or a key between them.
 */

async function loadPrivateKey(pem: string): Promise<KeyLike> {
  return (await importPKCS8(pem, 'RS256')) as KeyLike
}

function readEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set — see relay/.env.example`)
  return value.replace(/\\n/g, '\n')
}

let configKey: KeyLike | null = null
let sessionKey: KeyLike | null = null

export async function configSigningKey(): Promise<{ key: KeyLike; kid: string }> {
  if (!configKey) configKey = await loadPrivateKey(readEnv('CONFIG_SIGNING_PRIVATE_KEY_PEM'))
  return { key: configKey, kid: readEnv('CONFIG_SIGNING_KID') }
}

export async function sessionSigningKey(): Promise<{ key: KeyLike; kid: string }> {
  if (!sessionKey) sessionKey = await loadPrivateKey(readEnv('SESSION_SIGNING_PRIVATE_KEY_PEM'))
  return { key: sessionKey, kid: readEnv('SESSION_SIGNING_KID') }
}

// exportJWK() on a private key returns the FULL private JWK (n, e, and the private
// d/p/q/dp/dq/qi components) — publishing that verbatim would leak the signing key.
// Strip everything but the public modulus/exponent before this is ever served.
const PRIVATE_JWK_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'] as const

export async function publicJwk(privateKey: KeyLike, kid: string) {
  const jwk = (await exportJWK(privateKey)) as unknown as Record<string, unknown>
  for (const field of PRIVATE_JWK_FIELDS) delete jwk[field]
  return { ...jwk, kid, alg: 'RS256', use: 'sig' }
}
