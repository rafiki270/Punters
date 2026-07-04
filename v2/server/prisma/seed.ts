import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Idempotent seed: defaults always, demo catalog/zone only when the database is empty
 * (or SEED_DEMO=1 forces the check). The demo shows off the template variety: taps,
 * cocktails, wine, and a food menu with categories.
 */
async function main() {
  await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, venueName: 'Punters Taproom' } })

  const sizes = [
    { name: 'Pint', volumeMl: 568, displayOrder: 1, kinds: 'beer,cider' },
    { name: 'Half', volumeMl: 284, displayOrder: 2, kinds: 'beer,cider' },
    { name: '2/3', volumeMl: 379, displayOrder: 3, kinds: 'beer,cider' },
    { name: '125ml', volumeMl: 125, displayOrder: 4, kinds: 'wine' },
    { name: '175ml', volumeMl: 175, displayOrder: 5, kinds: 'wine' },
    { name: '250ml', volumeMl: 250, displayOrder: 6, kinds: 'wine' },
    { name: 'Single', volumeMl: 25, displayOrder: 7, kinds: 'spirit' },
    { name: 'Double', volumeMl: 50, displayOrder: 8, kinds: 'spirit' },
  ]
  for (const s of sizes) {
    await prisma.serveSize.upsert({ where: { name: s.name }, update: { kinds: s.kinds, displayOrder: s.displayOrder }, create: s })
  }

  if ((await prisma.item.count()) > 0) {
    console.log('Seed: catalog already populated, defaults refreshed only')
    return
  }

  const sizeByName = Object.fromEntries((await prisma.serveSize.findMany()).map((s) => [s.name, s.id]))
  const P = (name: string, amountMinor: number) => ({ sizeId: sizeByName[name], amountMinor })

  async function item(data: Record<string, unknown>, prices: { sizeId?: number; amountMinor: number }[]) {
    const created = await prisma.item.create({ data: data as never })
    for (const p of prices) {
      await prisma.price.create({ data: { itemId: created.id, sizeId: p.sizeId ?? null, amountMinor: p.amountMinor } })
    }
    return created
  }

  // ---------- beers on tap ----------
  const beers = [
    await item({ kind: 'beer', name: 'Galaxy Haze', producer: 'Punters Brewing Co.', style: 'Hazy IPA', abv: 6.2 }, [P('Pint', 680), P('Half', 350), P('2/3', 480)]),
    await item({ kind: 'beer', name: 'Session Pale', producer: 'Punters Brewing Co.', style: 'Pale Ale', abv: 4.1, vegan: true }, [P('Pint', 560), P('Half', 290)]),
    await item({ kind: 'beer', name: 'Midnight Stout', producer: 'Old Town Brewery', style: 'Dry Stout', abv: 4.8 }, [P('Pint', 590), P('Half', 300)]),
    await item({ kind: 'beer', name: 'Crisp Lager', producer: 'Old Town Brewery', style: 'Helles', abv: 4.6, glutenFree: true }, [P('Pint', 540), P('Half', 280)]),
    await item({ kind: 'beer', name: 'West Coast IPA', producer: 'Wildflower Ales', style: 'IPA', abv: 6.8 }, [P('Pint', 700), P('Half', 360)]),
    await item({ kind: 'cider', name: 'Orchard Gold', producer: 'Hollow Tree', style: 'Medium cider', abv: 5.0, glutenFree: true }, [P('Pint', 580), P('Half', 300)]),
  ]
  for (let i = 0; i < beers.length; i++) {
    const number = i + 1
    await prisma.tap.create({ data: { number, itemId: beers[i].id, status: 'on' } })
    await prisma.tapAssignment.create({ data: { tapNumber: number, itemId: beers[i].id } })
  }
  await prisma.tap.createMany({ data: [{ number: 7 }, { number: 8 }] })

  // ---------- wine / cocktails ----------
  await item({ kind: 'wine', name: 'Picpoul de Pinet', producer: 'Domaine Roquemolière', style: 'White, crisp', abv: 13 }, [P('175ml', 650), P('250ml', 850)])
  await item({ kind: 'wine', name: 'Malbec Reserva', producer: 'Finca La Luna', style: 'Red, full', abv: 14 }, [P('175ml', 700), P('250ml', 900)])
  await item({ kind: 'cocktail', name: 'Old Fashioned', description: 'Bourbon • bitters • demerara • orange twist' }, [{ amountMinor: 950 }])
  await item({ kind: 'cocktail', name: 'Margarita', description: 'Tequila • Cointreau • lime • salt rim' }, [{ amountMinor: 900 }])
  await item({ kind: 'cocktail', name: 'Negroni', description: 'Gin • Campari • sweet vermouth' }, [{ amountMinor: 925 }])

  // ---------- food with categories ----------
  const starters = await prisma.category.create({ data: { kind: 'food', name: 'Starters', displayOrder: 1 } })
  const mains = await prisma.category.create({ data: { kind: 'food', name: 'Mains', displayOrder: 2 } })
  const desserts = await prisma.category.create({ data: { kind: 'food', name: 'Desserts', displayOrder: 3 } })

  await item({ kind: 'food', name: 'Beer-battered pickles', description: 'House pickles, chipotle mayo', categoryId: starters.id, vegetarian: true, spicyLevel: 1 }, [{ amountMinor: 650 }])
  await item({ kind: 'food', name: 'Padrón peppers', description: 'Flaked sea salt', categoryId: starters.id, vegan: true, glutenFree: true }, [{ amountMinor: 600 }])
  await item({ kind: 'food', name: 'Taproom smash burger', description: 'Double patty, house sauce, fries', categoryId: mains.id }, [{ amountMinor: 1450 }])
  await item({ kind: 'food', name: 'Buttermilk fried chicken', description: 'Hot honey, slaw', categoryId: mains.id, spicyLevel: 2 }, [{ amountMinor: 1350 }])
  await item({ kind: 'food', name: 'Mushroom flatbread', description: 'Wild mushrooms, truffle oil', categoryId: mains.id, vegan: true }, [{ amountMinor: 1200 }])
  await item({ kind: 'food', name: 'Chocolate porter brownie', description: 'Stout caramel, vanilla ice cream', categoryId: desserts.id, vegetarian: true }, [{ amountMinor: 750 }])

  // ---------- a demo zone with a varied rotation ----------
  const zone = await prisma.zone.create({ data: { name: 'Main bar' } })
  const pages: { templateId: string; name: string; durationSec: number; config?: Record<string, unknown> }[] = [
    { templateId: 'tap-board', name: 'On tap', durationSec: 25 },
    {
      templateId: 'duo-lists',
      name: 'Cocktails & wine',
      durationSec: 20,
      config: {
        left: { source: { kinds: ['cocktail'] }, title: 'Cocktails' },
        right: { source: { kinds: ['wine'] }, title: 'Wine' },
      },
    },
    { templateId: 'menu-book', name: 'Kitchen menu', durationSec: 25 },
  ]
  for (let i = 0; i < pages.length; i++) {
    await prisma.page.create({
      data: {
        zoneId: zone.id,
        templateId: pages[i].templateId,
        name: pages[i].name,
        durationSec: pages[i].durationSec,
        sortOrder: i + 1,
        config: JSON.stringify(pages[i].config ?? {}),
      },
    })
  }

  console.log('Seed: defaults + demo catalog, taps 1-6 pouring, zone "Main bar" with 3 pages')
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
