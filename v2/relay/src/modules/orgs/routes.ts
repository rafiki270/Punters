import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../core/prisma'
import { httpError } from '../../core/errors'
import { requireUser, requireOrgRole, requireServiceToken } from '../../core/guards'
import { createOrganisation } from '../uoa/client'
import type { OrgTheme } from '@punters/shared'

function themeOf(org: { themeColors: string | null; themeFonts: string | null; themeLogoUrl: string | null }): OrgTheme {
  return {
    colors: org.themeColors ? JSON.parse(org.themeColors) : undefined,
    fonts: org.themeFonts ? JSON.parse(org.themeFonts) : undefined,
    logoUrl: org.themeLogoUrl,
  }
}

export async function orgsRoutes(app: FastifyInstance) {
  // What can this signed-in person do? Drives the venue-bind screen: pick an existing
  // venue, or create a brand new organisation + first venue if they have none yet.
  app.get('/relay/me/memberships', async (req) => {
    const user = await requireUser(req)
    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: { organisation: true, team: true },
    })
    const orgs = memberships
      .filter((m) => !m.teamId)
      .map((m) => ({ orgId: m.organisationId, orgName: m.organisation.name, orgRole: m.orgRole }))
    const teams = memberships
      .filter((m) => m.teamId)
      .map((m) => ({
        orgId: m.organisationId,
        orgName: m.organisation.name,
        teamId: m.teamId!,
        teamName: m.team!.name,
        teamRole: m.teamRole,
      }))
    return { orgs, teams, canCreateOrg: true }
  })

  app.post('/relay/organisations', async (req) => {
    const user = await requireUser(req)
    const { name } = z.object({ name: z.string().trim().min(1) }).parse(req.body)
    const uoaOrg = await createOrganisation({ name, ownerId: user.uoaSub })
    const organisation = await prisma.organisation.create({ data: { uoaOrgId: uoaOrg.orgId, name } })
    await prisma.membership.create({ data: { userId: user.id, organisationId: organisation.id, teamId: null, orgRole: 'owner' } })
    return { organisation }
  })

  // UOA has no generic team-creation endpoint (see AUTH_ARCHITECTURE.md) — the relay
  // mints a synthetic id so venue-scoped features (service tokens, catalog) still work.
  app.post('/relay/organisations/:orgId/venues', async (req) => {
    const orgId = Number((req.params as { orgId: string }).orgId)
    const user = await requireUser(req)
    await requireOrgRole(user.id, orgId, ['owner', 'admin'])
    const { name } = z.object({ name: z.string().trim().min(1) }).parse(req.body)
    const team = await prisma.team.create({
      data: { uoaTeamId: `local:${randomUUID()}`, uoaLinked: false, organisationId: orgId, name },
    })
    await prisma.membership.create({ data: { userId: user.id, organisationId: orgId, teamId: team.id, orgRole: 'owner', teamRole: 'owner' } })
    return { team }
  })

  app.put('/relay/organisations/:orgId', async (req) => {
    const orgId = Number((req.params as { orgId: string }).orgId)
    const user = await requireUser(req)
    await requireOrgRole(user.id, orgId, ['owner', 'admin'])
    const { name } = z.object({ name: z.string().trim().min(1) }).parse(req.body)
    const organisation = await prisma.organisation.update({ where: { id: orgId }, data: { name } })
    return { organisation }
  })

  app.put('/relay/organisations/:orgId/theme', async (req) => {
    const orgId = Number((req.params as { orgId: string }).orgId)
    const user = await requireUser(req)
    await requireOrgRole(user.id, orgId, ['owner', 'admin'])
    const body = z
      .object({
        colors: z.record(z.string(), z.string()).nullish(),
        fonts: z.object({ fontFamily: z.string().optional(), importUrl: z.string().optional() }).nullish(),
        logoUrl: z.string().nullish(),
      })
      .parse(req.body)
    const organisation = await prisma.organisation.update({
      where: { id: orgId },
      data: {
        themeColors: body.colors !== undefined ? (body.colors ? JSON.stringify(body.colors) : null) : undefined,
        themeFonts: body.fonts !== undefined ? (body.fonts ? JSON.stringify(body.fonts) : null) : undefined,
        themeLogoUrl: body.logoUrl !== undefined ? body.logoUrl : undefined,
      },
    })
    return { theme: themeOf(organisation) }
  })

  app.get('/relay/organisations/:orgId', async (req) => {
    const orgId = Number((req.params as { orgId: string }).orgId)
    const user = await requireUser(req)
    await requireOrgRole(user.id, orgId, ['owner', 'admin', 'member'])
    const organisation = await prisma.organisation.findUnique({ where: { id: orgId }, include: { teams: true } })
    if (!organisation) throw httpError(404, 'Organisation not found')
    return { organisation, theme: themeOf(organisation) }
  })

  app.put('/relay/teams/:teamId', async (req) => {
    const teamId = Number((req.params as { teamId: string }).teamId)
    const user = await requireUser(req)
    const team = await prisma.team.findUnique({ where: { id: teamId } })
    if (!team) throw httpError(404, 'Venue not found')
    await requireOrgRole(user.id, team.organisationId, ['owner', 'admin'])
    const { name } = z.object({ name: z.string().trim().min(1) }).parse(req.body)
    return { team: await prisma.team.update({ where: { id: teamId }, data: { name } }) }
  })

  // A venue server's local Settings row stores what this returns and never asks again.
  app.post('/relay/venues/:teamId/bind', async (req) => {
    const teamId = Number((req.params as { teamId: string }).teamId)
    const user = await requireUser(req)
    const team = await prisma.team.findUnique({ where: { id: teamId }, include: { organisation: true } })
    if (!team) throw httpError(404, 'Venue not found')
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, organisationId: team.organisationId, OR: [{ teamId }, { teamId: null, orgRole: { in: ['owner', 'admin'] } }] },
    })
    if (!membership) throw httpError(403, 'You are not a member of this venue')

    let serviceToken = await prisma.venueServiceToken.findFirst({ where: { teamId, revokedAt: null } })
    if (!serviceToken) {
      serviceToken = await prisma.venueServiceToken.create({ data: { teamId, token: `vst_${randomUUID().replace(/-/g, '')}` } })
    }
    return {
      orgId: team.organisationId,
      orgName: team.organisation.name,
      teamId: team.id,
      teamName: team.name,
      serviceToken: serviceToken.token,
    }
  })

  // Theme for the venue's own polling loop — auth'd by service token, not human session.
  // The token itself identifies the venue; the URL's :teamId must agree (defense in depth).
  app.get('/relay/teams/:teamId/theme', async (req) => {
    const teamId = Number((req.params as { teamId: string }).teamId)
    const team = await requireServiceToken(req)
    if (team.id !== teamId) throw httpError(403, 'Service token does not match this venue')
    const organisation = await prisma.organisation.findUnique({ where: { id: team.organisationId } })
    if (!organisation) throw httpError(404, 'Organisation not found')
    return { theme: themeOf(organisation) }
  })
}
