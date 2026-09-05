import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseDecklistText } from "@/actions/import";

/**
 * Calculates ownership and completion between deck cards and collection map.
 */
function calculateCrossMatching(
  deckCards: Array<{ name: string; quantity: number }>,
  collectionMap: Map<string, number>
) {
  const totalDeckCards = deckCards.reduce((sum, c) => sum + c.quantity, 0);

  let matchedUniqueCards = 0;
  let ownedCards = 0;
  const matchedList: Array<{ name: string; required: number; owned: number }> = [];
  const missingList: Array<{ name: string; required: number }> = [];

  for (const card of deckCards) {
    const key = card.name.toLowerCase().trim();
    // Support matching both full name and front face of split/double-faced cards
    const frontFaceKey = key.split(" // ")[0].trim();

    const ownedQty = collectionMap.get(key) || collectionMap.get(frontFaceKey) || 0;

    if (ownedQty > 0) {
      matchedUniqueCards++;
      const effectiveOwned = Math.min(ownedQty, card.quantity);
      ownedCards += effectiveOwned;
      matchedList.push({ name: card.name, required: card.quantity, owned: ownedQty });
    } else {
      missingList.push({ name: card.name, required: card.quantity });
    }
  }

  const missingCardsCount = Math.max(0, totalDeckCards - ownedCards);
  const completionPercentage =
    totalDeckCards > 0
      ? Math.round((ownedCards / totalDeckCards) * 1000) / 10
      : 0;

  return {
    totalDeckCards,
    uniqueDeckCards: deckCards.length,
    matchedUniqueCards,
    ownedCards,
    missingCardsCount,
    completionPercentage,
    matchedList,
    missingList,
  };
}

const deckFilePath = path.join(process.cwd(), "data/mazos/test.txt");
const collectionDir = path.join(process.cwd(), "data/coleciones");
const hasData = fs.existsSync(deckFilePath) && fs.existsSync(collectionDir);

describe.skipIf(!hasData)("Local Data Cross-Matching (data/mazos vs data/coleciones)", () => {

  it("should verify deck file exists and parses exactly 100 cards", () => {
    expect(fs.existsSync(deckFilePath)).toBe(true);

    const deckRaw = fs.readFileSync(deckFilePath, "utf-8");
    const parsedDeck = parseDecklistText(deckRaw);

    const totalQty = parsedDeck.reduce((s, c) => s + c.quantity, 0);

    expect(parsedDeck.length).toBe(86);
    expect(totalQty).toBe(100);
  });

  it("should match deck cards against individual collection files", () => {
    const deckRaw = fs.readFileSync(deckFilePath, "utf-8");
    const parsedDeck = parseDecklistText(deckRaw);

    const files = ["test1.txt", "test2.txt", "test3.txt", "test4.txt"];

    const results: Record<string, { matchedUnique: number; owned: number }> = {};

    for (const file of files) {
      const filePath = path.join(collectionDir, file);
      expect(fs.existsSync(filePath)).toBe(true);

      const raw = fs.readFileSync(filePath, "utf-8");
      const parsedCol = parseDecklistText(raw);

      const colMap = new Map<string, number>();
      for (const c of parsedCol) {
        const key = c.name.toLowerCase().trim();
        colMap.set(key, (colMap.get(key) || 0) + c.quantity);
      }

      const matchResult = calculateCrossMatching(parsedDeck, colMap);
      results[file] = {
        matchedUnique: matchResult.matchedUniqueCards,
        owned: matchResult.ownedCards,
      };
    }

    // test1.txt has 1 matching card
    expect(results["test1.txt"].matchedUnique).toBe(1);
    expect(results["test1.txt"].owned).toBe(1);

    // test2.txt has 26 matching cards (40 total copies owned)
    expect(results["test2.txt"].matchedUnique).toBe(26);
    expect(results["test2.txt"].owned).toBe(40);

    // test3.txt has 3 matching cards (3 copies)
    expect(results["test3.txt"].matchedUnique).toBe(3);
    expect(results["test3.txt"].owned).toBe(3);

    // test4.txt has 7 matching cards (7 copies)
    expect(results["test4.txt"].matchedUnique).toBe(7);
    expect(results["test4.txt"].owned).toBe(7);
  });

  it("should calculate exact combined cross-matching (46.0% completion, 46 owned, 54 missing)", () => {
    const deckRaw = fs.readFileSync(deckFilePath, "utf-8");
    const parsedDeck = parseDecklistText(deckRaw);

    const files = ["test1.txt", "test2.txt", "test3.txt", "test4.txt"];
    const combinedCollectionMap = new Map<string, number>();

    for (const file of files) {
      const filePath = path.join(collectionDir, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsedCol = parseDecklistText(raw);

      for (const c of parsedCol) {
        const key = c.name.toLowerCase().trim();
        combinedCollectionMap.set(key, (combinedCollectionMap.get(key) || 0) + c.quantity);
      }
    }

    const match = calculateCrossMatching(parsedDeck, combinedCollectionMap);

    // Total deck cards
    expect(match.totalDeckCards).toBe(100);
    expect(match.uniqueDeckCards).toBe(86);

    // Cross-matched results
    expect(match.matchedUniqueCards).toBe(32);
    expect(match.ownedCards).toBe(46);
    expect(match.missingCardsCount).toBe(54);
    expect(match.completionPercentage).toBe(46.0);

    // Key cards verification
    const matchedNames = match.matchedList.map((c) => c.name);
    expect(matchedNames).toContain("Aragorn, the Uniter");
    expect(matchedNames).toContain("Annie Joins Up");
    expect(matchedNames).toContain("Arcane Signet");
    expect(matchedNames).toContain("Command Tower");
    expect(matchedNames).toContain("Cultivate");
    expect(matchedNames).toContain("Elven Chorus");
    expect(matchedNames).toContain("Exotic Orchard");
    expect(matchedNames).toContain("Farseek");
  });
});
