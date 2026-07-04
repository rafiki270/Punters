import { SignJWT, jwtVerify } from 'jose'
import { sessionSigningKey } from '../../core/keys'
import { httpError } from '../../core/errors'
import type { RelaySessionClaims } from '@punters/shared'

const SESSION_TTL_SEC = 12 * 60 * 60 // 12h; re-login required after, no silent refresh in v1

/** The relay's own session token is a pure identity credential (sub, email) — it does
 * NOT carry org/team, since one signed-in person may administer several venues. Each
 * venue's local server tracks its own org/team binding separately (see AUTH_ARCHITECTURE.md). */
export async function mintSessionToken(sub: string, email: string): Promise<string> {
  const { key, kid } = await sessionSigningKey()
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(key)
}

export async function verifySessionToken(token: string): Promise<Pick<RelaySessionClaims, 'sub' | 'email' | 'iat' | 'exp'>> {
  const { key, kid } = await sessionSigningKey()
  try {
    const { payload, protectedHeader } = await jwtVerify(token, key, { algorithms: ['RS256'] })
    if (protectedHeader.kid !== kid) throw new Error('kid mismatch')
    return { sub: payload.sub!, email: payload.email as string, iat: payload.iat!, exp: payload.exp! }
  } catch {
    throw httpError(401, 'Invalid or expired session')
  }
}

export function bearerFrom(header: string | undefined): string {
  const value = header?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!value) throw httpError(401, 'Missing Authorization: Bearer token')
  return value
}
