import { prisma } from "@/lib/prisma";
import { normalizeCardName } from "@/lib/worker";
import { calculateCardmarketQuote } from "@/lib/pricing/cardmarket";
import { calculateCardTraderQuote } from "@/lib/pricing/cardtrader";
import { calculateMTGGoldfishQuote } from "@/lib/pricing/mtggoldfish";

export interface PricingWorkerResult {
  success: boolean;
  totalCardsProcessed: number;
  updatedCatalogCount: number;
  durationMs: number;
  timestamp: string;
  errors: string[];
}

/**
 * Worker that extracts and persists market prices for all cards in user collections.
 * Designed to run on a weekly schedule (or on demand) with 100ms rate-limiting.
 */
export async function runWeeklyCollectionPricingWorker(options?: {
  delayMs?: number;
  limit?: number;
}): Promise<PricingWorkerResult> {
  const startTime = Date.now();
  const delayMs = options?.delayMs ?? 100;
  const errors: string[] = [];

  // 1. Get all distinct cards in collections
  const distinctCollectionCards = await prisma.collectionCard.findMany({
    distinct: ["cardName"],
    select: {
      cardName: true,
      cardScryfallId: true,
      setCode: true,
      collectorNumber: true,
    },
    take: options?.limit ?? 1000,
  });

  let updatedCatalogCount = 0;

  for (let i = 0; i < distinctCollectionCards.length; i++) {
    const item = distinctCollectionCards[i];
    const norm = normalizeCardName(item.cardName);

    try {
      // Respect rate limits for external APIs
      if (i > 0 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      // Fetch Scryfall card data for official prices & purchase links
      let scryfallData: any = null;
      if (item.cardScryfallId && !item.cardScryfallId.startsWith("pending:") && !item.cardScryfallId.startsWith("custom-")) {
        try {
          const res = await fetch(`https://api.scryfall.com/cards/${item.cardScryfallId}`, {
            headers: {
              "User-Agent": "MTGUtils/1.0 (PairProgramming/StudentProject)",
              Accept: "application/json",
            },
          });
          if (res.ok) {
            scryfallData = await res.json();
          }
        } catch {
          // fallback to name query if ID lookup fails
        }
      }

      if (!scryfallData) {
        try {
          const query = item.setCode
            ? `!"${item.cardName}" set:${item.setCode}`
            : `!"${item.cardName}"`;
          const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(item.cardName)}`, {
            headers: {
              "User-Agent": "MTGUtils/1.0 (PairProgramming/StudentProject)",
              Accept: "application/json",
            },
          });
          if (res.ok) {
            scryfallData = await res.json();
          }
        } catch {
          // ignore
        }
      }

      // Calculate quotes for all 3 providers
      const cardRef = { name: item.cardName, quantity: 1 };
      const mkmQuote = calculateCardmarketQuote(cardRef, scryfallData);
      const ctQuote = await calculateCardTraderQuote(cardRef, scryfallData);
      const gfQuote = calculateMTGGoldfishQuote(cardRef, scryfallData);

      const now = new Date();

      // Upsert into CardCatalog with latest weekly quotes
      if (prisma.cardCatalog?.upsert) {
        await prisma.cardCatalog.upsert({
          where: { normalizedName: norm },
          update: {
            priceCardmarketTrend: mkmQuote.unitPrice.trend,
            priceCardmarketMin: mkmQuote.unitPrice.min,
            priceCardmarketMax: mkmQuote.unitPrice.max,
            priceCardTraderTrend: ctQuote.unitPrice.trend,
            priceCardTraderMin: ctQuote.unitPrice.min,
            priceCardTraderMax: ctQuote.unitPrice.max,
            priceGoldfishTrend: gfQuote.unitPrice.trend,
            priceGoldfishMin: gfQuote.unitPrice.min,
            priceGoldfishMax: gfQuote.unitPrice.max,
            pricesUpdatedAt: now,
          },
          create: {
            id: scryfallData?.id || item.cardScryfallId || `catalog-${norm}`,
            name: scryfallData?.name || item.cardName,
            normalizedName: norm,
            setCode: item.setCode || scryfallData?.set || null,
            collectorNumber: item.collectorNumber || scryfallData?.collector_number || null,
            manaCost: scryfallData?.mana_cost || null,
            typeLine: scryfallData?.type_line || null,
            imageUri:
              scryfallData?.image_uris?.normal ||
              scryfallData?.image_uris?.small ||
              null,
            priceCardmarketTrend: mkmQuote.unitPrice.trend,
            priceCardmarketMin: mkmQuote.unitPrice.min,
            priceCardmarketMax: mkmQuote.unitPrice.max,
            priceCardTraderTrend: ctQuote.unitPrice.trend,
            priceCardTraderMin: ctQuote.unitPrice.min,
            priceCardTraderMax: ctQuote.unitPrice.max,
            priceGoldfishTrend: gfQuote.unitPrice.trend,
            priceGoldfishMin: gfQuote.unitPrice.min,
            priceGoldfishMax: gfQuote.unitPrice.max,
            pricesUpdatedAt: now,
          },
        });
        updatedCatalogCount++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error updating price for ${item.cardName}: ${msg}`);
    }
  }

  return {
    success: errors.length === 0,
    totalCardsProcessed: distinctCollectionCards.length,
    updatedCatalogCount,
    durationMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    errors,
  };
}
