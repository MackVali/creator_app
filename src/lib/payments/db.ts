import { PrismaClient } from "@prisma/client";
import type { Business } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function getBusinessBySlugOrThrow(slug: string): Promise<Business> {
  const business = await prisma.business.findUnique({ where: { slug } });

  if (!business) {
    throw new Error("BUSINESS_NOT_FOUND");
  }

  if (!business.stripeAccountId) {
    throw new Error("BUSINESS_NOT_CONNECTED");
  }

  return business;
}
