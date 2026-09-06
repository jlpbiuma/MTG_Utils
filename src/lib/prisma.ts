import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

if (!process.env.DATABASE_URL) {
  console.error("❌ CRITICAL: DATABASE_URL environment variable is not set! Ensure it is configured in your deployment settings (e.g. Netlify Environment Variables).");
}

// In development, HMR can preserve an outdated PrismaClient instance from before schema changes
if (
  globalForPrisma.prisma &&
  !("cardCatalog" in (globalForPrisma.prisma as unknown as Record<string, unknown>))
) {
  globalForPrisma.prisma = undefined;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;


