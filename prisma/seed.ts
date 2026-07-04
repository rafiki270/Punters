import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create default sizes
  const sizes = [
    { name: 'Pint', volumeMl: 568, displayOrder: 1 },
    { name: 'Half Pint', volumeMl: 284, displayOrder: 2 },
    { name: 'Two Thirds Pint', volumeMl: 379, displayOrder: 3 },
    { name: 'One Third Pint', volumeMl: 189, displayOrder: 4 }
  ];

  for (const s of sizes) {
    await prisma.serveSize.upsert({
      where: { name: s.name },
      update: { volumeMl: s.volumeMl, displayOrder: s.displayOrder },
      create: s
    } as any);
  }

  const allSizes = await prisma.serveSize.findMany();
  const defaultSize = allSizes.find((s) => s.name === 'Pint') ?? allSizes[0];

  // Default price map (amount in pence for GBP)
  // Seed default guest prices for Pint/Half
  const guestDefaults: { name: string; amountMinor: number }[] = [
    { name: 'Pint', amountMinor: 600 },
    { name: 'Half Pint', amountMinor: 300 }
  ]
  for (const gd of guestDefaults) {
    const size = allSizes.find((s) => s.name === gd.name)
    if (size) {
      await prisma.defaultPrice.upsert({
        where: { serveSizeId_isGuest: { serveSizeId: size.id, isGuest: true } },
        update: { amountMinor: gd.amountMinor },
        create: { serveSizeId: size.id, isGuest: true, amountMinor: gd.amountMinor }
      })
    }
  }

  // Global settings singleton (id = 1)
  await prisma.globalSettings.upsert({
    where: { id: 1 },
    update: {
      defaultSizeId: defaultSize?.id,
      currency: 'GBP',
      authEnabled: false,
      adminPasswordHash: null,
      mode: 'server'
    },
    create: {
      id: 1,
      themeMode: 'dark',
      rotationSec: 90,
      defaultDisplayMode: 'all',
      currency: 'GBP',
      defaultSizeId: defaultSize?.id,
      locale: 'en-GB',
      authEnabled: false,
      mode: 'server'
    }
  });

  // Seed basic drink categories
  const baseDrinkCategories = [
    { name: 'Spirits', displayOrder: 1 },
    { name: 'Wine', displayOrder: 2 },
    { name: 'Soft Drinks', displayOrder: 3 },
  ]
  for (const c of baseDrinkCategories) {
    await prisma.drinkCategory.upsert({
      where: { name: c.name },
      update: { displayOrder: c.displayOrder, active: true },
      create: c as any,
    } as any)
  }

  // Optional demo data: sample beers and tap assignments (SEED_DEMO=1)
  const seedDemo = ['1', 'true', 'yes'].includes((process.env.SEED_DEMO ?? '').toLowerCase())
  if (seedDemo) {
    await seedDemoData(allSizes)
  }

  const cocktailCount = await prisma.cocktail.count()
  if (cocktailCount === 0) {
    await prisma.cocktail.createMany({
      data: [
        {
          name: 'Old Fashioned',
          ingredients: 'Bourbon • bitters • sugar • orange twist',
          priceMinor: 900,
          currency: 'GBP',
          active: true,
        },
        {
          name: 'Margarita',
          ingredients: 'Tequila • Cointreau • lime • salt rim',
          priceMinor: 850,
          currency: 'GBP',
          active: true,
        },
      ],
    })
  }
}

async function seedDemoData(allSizes: { id: number; name: string }[]) {
  const beerCount = await prisma.beer.count()
  if (beerCount > 0) {
    console.log('SEED_DEMO: beers already exist, skipping demo seed')
    return
  }

  const pint = allSizes.find((s) => s.name === 'Pint')
  const half = allSizes.find((s) => s.name === 'Half Pint')

  const demoBeers = [
    { name: 'Galaxy Haze', brewery: 'Punters Brewing Co.', style: 'Hazy IPA', abv: 6.2, colorHex: '#F5A623', pintMinor: 650, halfMinor: 340 },
    { name: 'Session Pale', brewery: 'Punters Brewing Co.', style: 'Pale Ale', abv: 4.1, colorHex: '#E8C547', pintMinor: 550, halfMinor: 290 },
    { name: 'Midnight Stout', brewery: 'Old Town Brewery', style: 'Dry Stout', abv: 4.8, colorHex: '#2B1B12', pintMinor: 580, halfMinor: 300 },
    { name: 'Crisp Lager', brewery: 'Old Town Brewery', style: 'Helles Lager', abv: 4.6, colorHex: '#F7E27B', pintMinor: 520, halfMinor: 280 },
    { name: 'Berry Sour', brewery: 'Wildflower Ales', style: 'Fruited Sour', abv: 3.9, colorHex: '#C0392B', isGuest: true, pintMinor: 620, halfMinor: 320 },
    { name: 'West Coast IPA', brewery: 'Wildflower Ales', style: 'IPA', abv: 6.8, colorHex: '#D98E32', isGuest: true, pintMinor: 680, halfMinor: 350 },
  ]

  const createdIds: number[] = []
  for (const b of demoBeers) {
    const { pintMinor, halfMinor, ...beerData } = b
    const beer = await prisma.beer.create({
      data: { ...beerData, isGuest: !!(b as any).isGuest, active: true },
    })
    createdIds.push(beer.id)
    const prices = [
      pint ? { serveSizeId: pint.id, amountMinor: pintMinor } : null,
      half ? { serveSizeId: half.id, amountMinor: halfMinor } : null,
    ].filter((p): p is { serveSizeId: number; amountMinor: number } => p != null)
    for (const p of prices) {
      await prisma.price.create({
        data: { beerId: beer.id, serveSizeId: p.serveSizeId, amountMinor: p.amountMinor, currency: 'GBP' },
      })
    }
  }

  // Assign the first four demo beers to taps 1-4, leaving the rest on the shelf
  const tapCount = Math.min(4, createdIds.length)
  for (let i = 0; i < tapCount; i++) {
    const number = i + 1
    const beerId = createdIds[i]
    await prisma.tap.upsert({
      where: { number },
      update: { beerId, status: 'on' },
      create: { number, beerId, status: 'on' },
    })
    await prisma.tapAssignment.create({ data: { tapNumber: number, beerId } })
  }

  console.log(`SEED_DEMO: created ${createdIds.length} beers and assigned taps 1-${tapCount}`)
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
