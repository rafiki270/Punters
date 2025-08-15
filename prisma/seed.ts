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
