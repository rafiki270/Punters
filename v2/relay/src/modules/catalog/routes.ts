import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../core/prisma'
import { httpError } from '../../core/errors'
import { requireUser, requireOrgRole, requireServiceToken } from '../../core/guards'
import type { SharedCatalogItem } from '@punters/shared'

function toSharedCatalogItem(item: {
  id: number
  kind: string
  name: string
  producer: string | null
  style: string | null
  abv: number | null
  description: string | null
  category: { name: string } | null
  vegan: boolean
  vegetarian: boolean
  glutenFree: boolean
  dairyFree: boolean
  spicyLevel: number
  imageUrl: string | null
  prices: string
  active: boolean
  updatedAt: Date
}): SharedCatalogItem {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    producer: item.producer,
    style: item.style,
    abv: item.abv,
    description: item.description,
    categoryName: item.category?.name ?? null,
    vegan: item.vegan,
    vegetarian: item.vegetarian,
    glutenFree: item.glutenFree,
    dairyFree: item.dairyFree,
    spicyLevel: item.spicyLevel,
    imageUrl: item.imageUrl,
    prices: JSON.parse(item.prices),
    active: item.active,
    updatedAt: item.updatedAt.toISOString(),
  }
}

const itemInput = z.object({
  kind: z.string().trim().min(1),
  name: z.string().trim().min(1),
  producer: z.string().trim().nullish(),
  style: z.string().trim().nullish(),
  abv: z.number().min(0).max(100).nullish(),
  description: z.string().trim().nullish(),
  categoryId: z.number().int().nullish(),
  vegan: z.boolean().optional(),
  vegetarian: z.boolean().optional(),
  glutenFree: z.boolean().optional(),
  dairyFree: z.boolean().optional(),
  spicyLevel: z.number().int().min(0).max(3).optional(),
  imageUrl: z.string().nullish(),
  active: z.boolean().optional(),
  prices: z.array(z.object({ sizeName: z.string().nullable(), amountMinor: z.number().int().min(0) })).optional(),
})

async function bumpCatalogVersion(organisationId: number) {
  await prisma.organisation.update({ where: { id: organisationId }, data: { catalogVersion: { increment: 1 } } })
}

export async function catalogRoutes(app: FastifyInstance) {
  // ---------- org-admin management of the shared catalog ----------
  app.get('/relay/organisations/:orgId/items', async (req) => {
    const orgId = Number((req.params as { orgId: string }).orgId)
    const user = await requireUser(req)
    await requireOrgRole(user.id, orgId, ['owner', 'admin', 'member'])
    const items = await prisma.sharedItem.findMany({ where: { organisationId: orgId }, include: { category: true }, orderBy: { name: 'asc' } })
    return { items: items.map(toSharedCatalogItem) }
  })

  app.post('/relay/organisations/:orgId/categories', async (req) => {
    const orgId = Number((req.params as { orgId: string }).orgId)
    const user = await requireUser(req)
    await requireOrgRole(user.id, orgId, ['owner', 'admin'])
    const body = z.object({ kind: z.string().trim().min(1), name: z.string().trim().min(1), displayOrder: z.number().int().optional() }).parse(req.body)
    const category = await prisma.sharedCategory.create({ data: { organisationId: orgId, ...body } })
    return { category }
  })

  app.post('/relay/organisations/:orgId/items', async (req) => {
    const orgId = Number((req.params as { orgId: string }).orgId)
    const user = await requireUser(req)
    await requireOrgRole(user.id, orgId, ['owner', 'admin'])
    const body = itemInput.parse(req.body)
    const { prices, ...rest } = body
    const item = await prisma.sharedItem.create({
      data: { organisationId: orgId, ...rest, prices: JSON.stringify(prices ?? []) },
      include: { category: true },
    })
    await bumpCatalogVersion(orgId)
    return { item: toSharedCatalogItem(item) }
  })

  app.put('/relay/items/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const user = await requireUser(req)
    const existing = await prisma.sharedItem.findUnique({ where: { id } })
    if (!existing) throw httpError(404, 'Shared item not found')
    await requireOrgRole(user.id, existing.organisationId, ['owner', 'admin'])
    const body = itemInput.partial().parse(req.body)
    const { prices, ...rest } = body
    const item = await prisma.sharedItem.update({
      where: { id },
      data: { ...rest, prices: prices ? JSON.stringify(prices) : undefined },
      include: { category: true },
    })
    await bumpCatalogVersion(existing.organisationId)
    return { item: toSharedCatalogItem(item) }
  })

  app.delete('/relay/items/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const user = await requireUser(req)
    const existing = await prisma.sharedItem.findUnique({ where: { id } })
    if (!existing) throw httpError(404, 'Shared item not found')
    await requireOrgRole(user.id, existing.organisationId, ['owner', 'admin'])
    // Soft delete: venues that mirrored this item (and haven't forked it) hide it too,
    // rather than being silently orphaned by a hard delete.
    await prisma.sharedItem.update({ where: { id }, data: { active: false } })
    await bumpCatalogVersion(existing.organisationId)
    return { ok: true }
  })

  // ---------- venue-side pull (service token, unattended) ----------
  app.get('/relay/teams/:teamId/catalog', async (req) => {
    const teamId = Number((req.params as { teamId: string }).teamId)
    const team = await requireServiceToken(req)
    if (team.id !== teamId) throw httpError(403, 'Service token does not match this venue')

    const since = Number((req.query as { since?: string }).since ?? 0)
    const organisation = await prisma.organisation.findUnique({ where: { id: team.organisationId } })
    if (!organisation) throw httpError(404, 'Organisation not found')
    if (since >= organisation.catalogVersion) return { version: organisation.catalogVersion, items: [] }

    // No fine-grained per-item diffing (see AUTH_ARCHITECTURE.md) — send everything;
    // the venue applies deltas idempotently via each item's own `updatedAt`.
    const items = await prisma.sharedItem.findMany({ where: { organisationId: organisation.id }, include: { category: true } })
    return { version: organisation.catalogVersion, items: items.map(toSharedCatalogItem) }
  })
}
