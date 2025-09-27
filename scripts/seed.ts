import { prisma } from "../src/lib/payments/db";

async function main() {
  const business = await prisma.business.upsert({
    where: { slug: "taco-fiesta" },
    create: {
      name: "Taco Fiesta",
      slug: "taco-fiesta",
      feeBps: 500,
    },
    update: {},
  });

  await prisma.menuItem.createMany({
    data: [
      {
        businessId: business.id,
        name: "Al Pastor Taco",
        priceCents: 899,
        optionsJson: "[]",
      },
      {
        businessId: business.id,
        name: "Horchata",
        priceCents: 399,
        optionsJson: "[]",
      },
    ],
    skipDuplicates: true,
  });

  console.log("Seeded:", business.slug);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
