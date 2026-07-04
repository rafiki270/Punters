import type { FastifyRequest } from 'fastify'
import { prisma } from './prisma'
import { httpError } from './errors'
import { bearerFrom, verifySessionToken } from '../modules/auth/session'

/** A signed-in human, identified by the relay's own session JWT (see auth/session.ts). */
export async function requireUser(req: FastifyRequest) {
  const claims = await verifySessionToken(bearerFrom(req.headers.authorization))
  const user = await prisma.user.findUnique({ where: { uoaSub: claims.sub } })
  if (!user) throw httpError(401, 'Unknown session subject')
  return user
}

/** A venue's durable, non-human credential — used for unattended catalog/theme polling. */
export async function requireServiceToken(req: FastifyRequest) {
  const token = bearerFrom(req.headers.authorization)
  const row = await prisma.venueServiceToken.findUnique({ where: { token }, include: { team: true } })
  if (!row || row.revokedAt) throw httpError(401, 'Invalid or revoked venue service token')
  return row.team
}

export async function requireOrgRole(userId: number, organisationId: number, roles: string[]) {
  const membership = await prisma.membership.findFirst({ where: { userId, organisationId, teamId: null } })
  if (!membership || !roles.includes(membership.orgRole)) throw httpError(403, 'Insufficient organisation role')
  return membership
}
