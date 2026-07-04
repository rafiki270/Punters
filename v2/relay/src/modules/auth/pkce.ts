import { randomBytes, createHash, randomUUID } from 'node:crypto'

function base64url(buf: Buffer): string {
  return buf.toString('base64url')
}

export function newCodeVerifier(): string {
  return base64url(randomBytes(48)) // ~64 chars, well within the 43-128 range PKCE requires
}

export function codeChallengeFor(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest())
}

export function newOpaqueId(): string {
  return randomUUID().replace(/-/g, '')
}
