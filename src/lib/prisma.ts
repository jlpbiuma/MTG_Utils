import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

if (typeof window === "undefined" && !process.env.DATABASE_URL) {
  console.error("❌ CRITICAL: DATABASE_URL environment variable is not set! Ensure it is configured in your deployment settings (e.g. Netlify Environment Variables).");
}


// Helper to detect if the in-memory Prisma client is missing recent models or fields
function isClientOutdated(client: any): boolean {
  if (!client) return true;
  if (!("cardCatalog" in client)) return true;
  const deckCardFields = client._runtimeDataModel?.models?.DeckCard?.fields;
  if (deckCardFields && !deckCardFields.some((f: any) => f.name === "assignedQuantity")) {
    return true;
  }
  return false;
}

function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma && !isClientOutdated(globalForPrisma.prisma)) {
    return globalForPrisma.prisma;
  }

  // Clear module require cache in development so the newly generated client on disk is loaded
  if (process.env.NODE_ENV === "development" && typeof require !== "undefined" && require.cache) {
    Object.keys(require.cache).forEach((key) => {
      if (key.includes(".prisma") || key.includes("@prisma/client")) {
        delete require.cache[key];
      }
    });
  }

  const { PrismaClient: FreshClient } = require("@prisma/client");
  const newClient = new FreshClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = newClient;
  }

  return newClient;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = (client as any)[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});



