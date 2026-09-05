import { describe, it, expect } from "vitest";

/**
 * Pure calculation function for deck completion percentage and card counts.
 * Matches the logic in src/actions/decks.ts.
 */
function calculateDeckCompletion(
  deckCards: Array<{ cardScryfallId: string; quantity: number }>,
  collectionMap: Map<string, number>
) {
  const totalCards = deckCards.reduce((sum, c) => sum + c.quantity, 0);
  const uniqueCards = deckCards.length;

  const ownedCards = deckCards.reduce((sum, c) => {
    const owned = collectionMap.get(c.cardScryfallId) || 0;
    return sum + Math.min(owned, c.quantity);
  }, 0);

  const missingCardsCount = Math.max(0, totalCards - ownedCards);
  const completionPercentage =
    totalCards > 0 ? Math.round((ownedCards / totalCards) * 1000) / 10 : 0;

  return {
    totalCards,
    uniqueCards,
    ownedCards,
    missingCardsCount,
    completionPercentage,
  };
}

describe("Deck Completion & Ownership Calculations", () => {
  it("should return 0% completion and 0 cards for an empty deck", () => {
    const deckCards: Array<{ cardScryfallId: string; quantity: number }> = [];
    const collectionMap = new Map<string, number>();

    const stats = calculateDeckCompletion(deckCards, collectionMap);

    expect(stats.totalCards).toBe(0);
    expect(stats.uniqueCards).toBe(0);
    expect(stats.ownedCards).toBe(0);
    expect(stats.missingCardsCount).toBe(0);
    expect(stats.completionPercentage).toBe(0);
  });

  it("should return 100% completion when all required cards exist in collection", () => {
    const deckCards = [
      { cardScryfallId: "card-1", quantity: 4 },
      { cardScryfallId: "card-2", quantity: 2 },
    ];
    const collectionMap = new Map<string, number>([
      ["card-1", 4],
      ["card-2", 2],
    ]);

    const stats = calculateDeckCompletion(deckCards, collectionMap);

    expect(stats.totalCards).toBe(6);
    expect(stats.uniqueCards).toBe(2);
    expect(stats.ownedCards).toBe(6);
    expect(stats.missingCardsCount).toBe(0);
    expect(stats.completionPercentage).toBe(100);
  });

  it("should calculate partial completion accurately", () => {
    // Deck requires 10 cards: 4x Bolt, 4x Counterspell, 2x Island
    const deckCards = [
      { cardScryfallId: "bolt", quantity: 4 },
      { cardScryfallId: "counterspell", quantity: 4 },
      { cardScryfallId: "island", quantity: 2 },
    ];
    // User collection has: 2x Bolt, 4x Counterspell, 0x Island (6 owned of 10)
    const collectionMap = new Map<string, number>([
      ["bolt", 2],
      ["counterspell", 4],
    ]);

    const stats = calculateDeckCompletion(deckCards, collectionMap);

    expect(stats.totalCards).toBe(10);
    expect(stats.uniqueCards).toBe(3);
    expect(stats.ownedCards).toBe(6);
    expect(stats.missingCardsCount).toBe(4);
    expect(stats.completionPercentage).toBe(60);
  });

  it("should not count excess copies beyond what the deck requires", () => {
    // Deck requires 1x Sol Ring
    const deckCards = [{ cardScryfallId: "sol-ring", quantity: 1 }];
    // User has 10x Sol Ring in their collection binder
    const collectionMap = new Map<string, number>([["sol-ring", 10]]);

    const stats = calculateDeckCompletion(deckCards, collectionMap);

    expect(stats.totalCards).toBe(1);
    expect(stats.ownedCards).toBe(1); // capped at 1
    expect(stats.missingCardsCount).toBe(0);
    expect(stats.completionPercentage).toBe(100);
  });

  it("should calculate decimals properly rounded to 1 decimal place", () => {
    // 1 owned out of 3 total cards = 33.3%
    const deckCards = [{ cardScryfallId: "c1", quantity: 3 }];
    const collectionMap = new Map<string, number>([["c1", 1]]);

    const stats = calculateDeckCompletion(deckCards, collectionMap);

    expect(stats.completionPercentage).toBe(33.3);
    expect(stats.missingCardsCount).toBe(2);
  });
});
