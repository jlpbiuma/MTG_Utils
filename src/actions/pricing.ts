"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "./auth";
import { getPriceSummary, PriceProvider, PriceSummary, CardToPrice } from "@/lib/pricing";

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

  return getPriceSummary(cardsToPrice, provider, bypassCache);
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

  return getPriceSummary(cardsToPrice, provider, bypassCache);
}
