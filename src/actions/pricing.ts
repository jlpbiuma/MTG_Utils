"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "./auth";
import { getPriceSummary, PriceProvider, PriceSummary, CardToPrice, PRICE_PROVIDERS } from "@/lib/pricing";
import { normalizeCardName } from "@/lib/card-utils";

/**
 * Server Action to dynamically calculate prices for a deck.
 */
export async function getDeckPriceSummary(
  deckId: string,
  provider: PriceProvider = "cardmarket",
  bypassCache: boolean = false
): Promise<PriceSummary | null> {
  const userId = await getCurrentUserId();

  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
    include: {
      cards: true,
    },
  });

  if (!deck) return null;

  // Build collection map to know which cards are missing
  const collection = await prisma.collectionCard.findMany({
    where: { userId },
    select: { cardScryfallId: true, cardName: true, quantity: true },
  });

  const ownedMap = new Map<string, number>();
  for (const item of collection) {
    ownedMap.set(item.cardScryfallId, item.quantity);
    const norm = item.cardName.toLowerCase().trim().split(" // ")[0];
    ownedMap.set(norm, (ownedMap.get(norm) || 0) + item.quantity);
  }

  const cardsToPrice: CardToPrice[] = deck.cards.map((c) => {
    const norm = c.cardName.toLowerCase().trim().split(" // ")[0];
    const owned = ownedMap.get(c.cardScryfallId) || ownedMap.get(norm) || 0;
    const isMissing = owned < c.quantity;

    return {
      name: c.cardName,
      scryfallId: c.cardScryfallId,
      quantity: c.quantity,
      isMissing,
    };
  });

  return getPriceSummaryWithCatalogCache(cardsToPrice, provider, bypassCache);
}

/**
 * Server Action to dynamically calculate total net worth and prices for user's collection.
 */
export async function getCollectionPriceSummary(
  provider: PriceProvider = "cardmarket",
  bypassCache: boolean = false
): Promise<PriceSummary> {
  const userId = await getCurrentUserId();

  const cards = await prisma.collectionCard.findMany({
    where: { userId },
    select: {
      cardName: true,
      cardScryfallId: true,
      quantity: true,
    },
  });

  const cardsToPrice: CardToPrice[] = cards.map((c) => ({
    name: c.cardName,
    scryfallId: c.cardScryfallId,
    quantity: c.quantity,
    isMissing: false,
  }));

  return getPriceSummaryWithCatalogCache(cardsToPrice, provider, bypassCache);
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 3 days (259,200,000 ms)

/**
 * Core caching layer that checks CardCatalog in the database.
 * If prices are newer than 3 days, returns them without any external API calls.
 */
async function getPriceSummaryWithCatalogCache(
  cardsToPrice: CardToPrice[],
  provider: PriceProvider,
  bypassCache: boolean
): Promise<PriceSummary> {
  if (cardsToPrice.length === 0) {
    return getPriceSummary([], provider, bypassCache);
  }

  const now = Date.now();
  const threeDaysAgo = new Date(now - THREE_DAYS_MS);

  // If bypassCache is requested, skip database cache check and re-fetch directly
  if (bypassCache) {
    const freshSummary = await getPriceSummary(cardsToPrice, provider, true);
    persistQuotesToCatalog(freshSummary.quotes, provider).catch((e) =>
      console.warn("Could not persist refreshed quotes to catalog:", e)
    );
    return freshSummary;
  }

  // Check CardCatalog for cards updated within the last 3 days
  const normalizedNames = Array.from(
    new Set(cardsToPrice.map((c) => normalizeCardName(c.name)))
  );

  let cachedCatalog: any[] = [];
  try {
    if (prisma.cardCatalog?.findMany) {
      cachedCatalog = await prisma.cardCatalog.findMany({
        where: {
          normalizedName: { in: normalizedNames },
          pricesUpdatedAt: { gte: threeDaysAgo },
        },
      });
    }
  } catch (err) {
    console.warn("CardCatalog cache lookup failed, will fetch directly:", err);
  }

  const catalogMap = new Map<string, any>(
    cachedCatalog.map((c) => [c.normalizedName, c])
  );

  const uncachedCards: CardToPrice[] = [];
  const cachedQuotes: Record<string, any> = {};

  const config = PRICE_PROVIDERS[provider] || PRICE_PROVIDERS.cardmarket;

  for (const card of cardsToPrice) {
    const norm = normalizeCardName(card.name);
    const cat = catalogMap.get(norm);

    let hasValidPrice = false;
    let unitPrice = { trend: 0, min: 0, max: 0 };

    if (cat) {
      if (provider === "cardmarket" && cat.priceCardmarketTrend != null) {
        hasValidPrice = true;
        unitPrice = {
          trend: cat.priceCardmarketTrend,
          min: cat.priceCardmarketMin ?? cat.priceCardmarketTrend,
          max: cat.priceCardmarketMax ?? cat.priceCardmarketTrend,
        };
      } else if (provider === "cardtrader" && cat.priceCardTraderTrend != null) {
        hasValidPrice = true;
        unitPrice = {
          trend: cat.priceCardTraderTrend,
          min: cat.priceCardTraderMin ?? cat.priceCardTraderTrend,
          max: cat.priceCardTraderMax ?? cat.priceCardTraderTrend,
        };
      } else if (provider === "mtggoldfish" && cat.priceGoldfishTrend != null) {
        hasValidPrice = true;
        unitPrice = {
          trend: cat.priceGoldfishTrend,
          min: cat.priceGoldfishMin ?? cat.priceGoldfishTrend,
          max: cat.priceGoldfishMax ?? cat.priceGoldfishTrend,
        };
      }
    }

    if (hasValidPrice && cat) {
      const qty = card.quantity ?? 1;
      const quote = {
        cardName: cat.name || card.name,
        scryfallId: cat.id || card.scryfallId,
        provider,
        currency: config.currency,
        currencySymbol: config.currencySymbol,
        unitPrice,
        quantity: qty,
        subtotal: Math.round(unitPrice.trend * qty * 100) / 100,
        lastUpdated: cat.pricesUpdatedAt?.toISOString() || new Date(now).toISOString(),
      };
      cachedQuotes[norm] = quote;
      if (card.scryfallId) {
        cachedQuotes[card.scryfallId] = quote;
      }
    } else {
      uncachedCards.push(card);
    }
  }

  // If ALL cards were found in database with prices < 3 days old, return immediately!
  if (uncachedCards.length === 0) {
    let totalCards = 0;
    let totalNetValue = 0;
    let totalOwnedValue = 0;
    let totalMissingValue = 0;

    for (const card of cardsToPrice) {
      const norm = normalizeCardName(card.name);
      const q = cachedQuotes[norm] || (card.scryfallId ? cachedQuotes[card.scryfallId] : undefined);
      const qty = card.quantity ?? 1;
      const subtotal = q ? q.subtotal : 0;

      totalCards += qty;
      totalNetValue += subtotal;
      if (card.isMissing) {
        totalMissingValue += subtotal;
      } else {
        totalOwnedValue += subtotal;
      }
    }

    return {
      provider,
      currency: config.currency,
      currencySymbol: config.currencySymbol,
      totalCards,
      totalNetValue: Math.round(totalNetValue * 100) / 100,
      totalOwnedValue: Math.round(totalOwnedValue * 100) / 100,
      totalMissingValue: Math.round(totalMissingValue * 100) / 100,
      quotes: cachedQuotes,
    };
  }

  // Fetch missing prices for cards not cached or older than 3 days
  const fetchedSummary = await getPriceSummary(uncachedCards, provider, false);

  persistQuotesToCatalog(fetchedSummary.quotes, provider).catch((e) =>
    console.warn("Could not persist newly fetched quotes to catalog:", e)
  );

  const mergedQuotes = { ...cachedQuotes, ...fetchedSummary.quotes };

  let totalCards = 0;
  let totalNetValue = 0;
  let totalOwnedValue = 0;
  let totalMissingValue = 0;

  for (const card of cardsToPrice) {
    const norm = normalizeCardName(card.name);
    const q = mergedQuotes[norm] || (card.scryfallId ? mergedQuotes[card.scryfallId] : undefined);
    const qty = card.quantity ?? 1;
    const subtotal = q ? q.subtotal : 0;

    totalCards += qty;
    totalNetValue += subtotal;
    if (card.isMissing) {
      totalMissingValue += subtotal;
    } else {
      totalOwnedValue += subtotal;
    }
  }

  return {
    provider,
    currency: config.currency,
    currencySymbol: config.currencySymbol,
    totalCards,
    totalNetValue: Math.round(totalNetValue * 100) / 100,
    totalOwnedValue: Math.round(totalOwnedValue * 100) / 100,
    totalMissingValue: Math.round(totalMissingValue * 100) / 100,
    quotes: mergedQuotes,
  };
}

async function persistQuotesToCatalog(
  quotes: Record<string, any>,
  provider: PriceProvider
) {
  if (!prisma.cardCatalog?.upsert) return;
  const now = new Date();

  const distinctQuotes = new Map<string, any>();
  for (const q of Object.values(quotes)) {
    const norm = normalizeCardName(q.cardName);
    if (!distinctQuotes.has(norm)) {
      distinctQuotes.set(norm, q);
    }
  }

  for (const [norm, quote] of distinctQuotes.entries()) {
    try {
      const priceUpdate: any = { pricesUpdatedAt: now };
      if (provider === "cardmarket") {
        priceUpdate.priceCardmarketTrend = quote.unitPrice.trend;
        priceUpdate.priceCardmarketMin = quote.unitPrice.min;
        priceUpdate.priceCardmarketMax = quote.unitPrice.max;
      } else if (provider === "cardtrader") {
        priceUpdate.priceCardTraderTrend = quote.unitPrice.trend;
        priceUpdate.priceCardTraderMin = quote.unitPrice.min;
        priceUpdate.priceCardTraderMax = quote.unitPrice.max;
      } else if (provider === "mtggoldfish") {
        priceUpdate.priceGoldfishTrend = quote.unitPrice.trend;
        priceUpdate.priceGoldfishMin = quote.unitPrice.min;
        priceUpdate.priceGoldfishMax = quote.unitPrice.max;
      }

      await prisma.cardCatalog.upsert({
        where: { normalizedName: norm },
        update: priceUpdate,
        create: {
          id: quote.scryfallId || `cat-${norm}`,
          name: quote.cardName,
          normalizedName: norm,
          ...priceUpdate,
        },
      });
    } catch {
      // Ignore individual upsert background errors
    }
  }
}

/**
 * Server action to manually trigger the weekly collection pricing worker.
 */
export async function triggerWeeklyCollectionPricing() {
  const { runWeeklyCollectionPricingWorker } = await import("@/lib/pricing-worker");
  return runWeeklyCollectionPricingWorker({ delayMs: 80 });
}

/**
 * Gets the timestamp of when collection card prices were most recently updated in the catalog.
 */
export async function getCollectionPricesLastUpdated(): Promise<string | null> {
  try {
    if (!prisma.cardCatalog?.findFirst) return null;
    const latest = await prisma.cardCatalog.findFirst({
      where: { pricesUpdatedAt: { not: null } },
      orderBy: { pricesUpdatedAt: "desc" },
      select: { pricesUpdatedAt: true },
    });
    return latest?.pricesUpdatedAt ? latest.pricesUpdatedAt.toISOString() : null;
  } catch {
    return null;
  }
}

