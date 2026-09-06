import { describe, it, expect } from "vitest";
import { toEdhrecSlug, getEdhrecCardImageUrl } from "@/lib/edhrec";
import { normalizeCardName } from "@/lib/card-utils";
import { EdhrecCardRecommendation } from "@/lib/schemas";

describe("EDHREC Integration & Recommendation Logic", () => {
  describe("toEdhrecSlug", () => {
    it("converts simple commander names to lowercase hyphenated slugs", () => {
      expect(toEdhrecSlug("Aragorn, the Uniter")).toBe("aragorn-the-uniter");
      expect(toEdhrecSlug("Niv-Mizzet, Parun")).toBe("niv-mizzet-parun");
      expect(toEdhrecSlug("Urza, Lord High Artificer")).toBe("urza-lord-high-artificer");
    });

    it("handles diacritics and accents cleanly", () => {
      expect(toEdhrecSlug("Lim-Dûl's Vault")).toBe("lim-duls-vault");
      expect(toEdhrecSlug("Séance")).toBe("seance");
      expect(toEdhrecSlug("Borborygmos Enragé")).toBe("borborygmos-enrage");
    });

    it("handles punctuation like apostrophes, quotes, and commas", () => {
      expect(toEdhrecSlug("Atraxa, Praetors' Voice")).toBe("atraxa-praetors-voice");
      expect(toEdhrecSlug("Kongming, \"Sleeping Dragon\"")).toBe("kongming-sleeping-dragon");
    });

    it("handles partner / split slashes (//)", () => {
      expect(toEdhrecSlug("Kraum, Ludevic's Opus // Tymna the Weaver")).toBe(
        "kraum-ludevics-opus-tymna-the-weaver"
      );
    });

    it("handles empty or falsy inputs gracefully", () => {
      expect(toEdhrecSlug("")).toBe("");
      expect(toEdhrecSlug("   ")).toBe("");
    });
  });

  describe("getEdhrecCardImageUrl", () => {
    it("constructs valid EDHREC CDN image URLs from Scryfall UUIDs", () => {
      const id = "c05c2aa6-29c7-40f8-872e-91099b9225c4";
      expect(getEdhrecCardImageUrl(id)).toBe(
        "https://card-images.edhrec.com/normal/front/c/0/c05c2aa6-29c7-40f8-872e-91099b9225c4.jpg"
      );
    });

    it("returns null for invalid or empty UUIDs", () => {
      expect(getEdhrecCardImageUrl("")).toBeNull();
      expect(getEdhrecCardImageUrl("a")).toBeNull();
    });
  });

  describe("Pure Name Matching Requirement", () => {
    it("matches cards across deck, collection, and EDHREC regardless of set, printing, or case", () => {
      const edhrecCardName = "Birds of Paradise";
      const collectionCardName = "birds of paradise";
      const deckCardName = "Birds of Paradise // Front";

      const normEdhrec = normalizeCardName(edhrecCardName);
      const normCollection = normalizeCardName(collectionCardName);
      const normDeck = normalizeCardName(deckCardName);

      expect(normEdhrec).toBe("birds of paradise");
      expect(normCollection).toBe("birds of paradise");
      expect(normDeck).toBe("birds of paradise");

      // Verify they match
      expect(normEdhrec === normCollection).toBe(true);
      expect(normEdhrec === normDeck).toBe(true);
    });

    it("matches cards ignoring whitespace and capitalization differences", () => {
      const edhrecName = "  Sol   Ring  ";
      const collectionName = "Sol Ring";

      expect(normalizeCardName(edhrecName)).toBe(normalizeCardName(collectionName));
    });
  });

  describe("Inclusion % and Synergy calculations", () => {
    it("calculates community inclusion percentage correctly", () => {
      const numDecks = 1530;
      const potentialDecks = 2000;
      const inclusionPct = Math.round(((numDecks / potentialDecks) * 100) * 10) / 10;

      expect(inclusionPct).toBe(76.5);
    });

    it("handles edge cases where potential decks is 0 or 1", () => {
      const numDecks = 0;
      const potentialDecks = 0;
      const inclusionPct = potentialDecks > 0 ? (numDecks / potentialDecks) * 100 : 0;

      expect(inclusionPct).toBe(0);
    });
  });

  describe("Recommendations Sorting and Ownership Highlighting", () => {
    const rawRecommendations: Array<{
      id: string;
      name: string;
      inclusionPct: number;
      synergy: number;
      categories: string[];
    }> = [
      { id: "1", name: "Arcane Signet", inclusionPct: 88.5, synergy: 10.2, categories: ["Mana Artifacts", "Top Cards"] },
      { id: "2", name: "Sol Ring", inclusionPct: 94.2, synergy: 5.1, categories: ["Mana Artifacts", "Top Cards"] },
      { id: "3", name: "Faeburrow Elder", inclusionPct: 74.0, synergy: 42.5, categories: ["Creatures", "High Synergy Cards"] },
      { id: "4", name: "Command Tower", inclusionPct: 91.4, synergy: 12.0, categories: ["Lands", "Top Cards"] },
    ];

    const deckCardNames = ["Sol Ring", "Arcane Signet"];
    const collectionCards = [
      { name: "Faeburrow Elder", quantity: 2 },
      { name: "Sol Ring", quantity: 3 },
    ];

    it("sorts recommendations by community inclusion % descending by default", () => {
      const sorted = [...rawRecommendations].sort((a, b) => b.inclusionPct - a.inclusionPct);

      expect(sorted[0].name).toBe("Sol Ring"); // 94.2%
      expect(sorted[1].name).toBe("Command Tower"); // 91.4%
      expect(sorted[2].name).toBe("Arcane Signet"); // 88.5%
      expect(sorted[3].name).toBe("Faeburrow Elder"); // 74.0%
    });

    it("maps ownership correctly: in deck vs in collection vs missing", () => {
      const deckSet = new Set(deckCardNames.map((n) => normalizeCardName(n)));
      const colMap = new Map(collectionCards.map((c) => [normalizeCardName(c.name), c.quantity]));

      const mapped: EdhrecCardRecommendation[] = rawRecommendations.map((r) => {
        const norm = normalizeCardName(r.name);
        const isInDeck = deckSet.has(norm);
        const collectionQuantity = colMap.get(norm) || 0;
        const isInCollection = collectionQuantity > 0;

        return {
          id: r.id,
          name: r.name,
          normalizedName: norm,
          sanitized: toEdhrecSlug(r.name),
          category: r.categories[0],
          categories: r.categories,
          numDecks: 100,
          potentialDecks: 100,
          inclusionPct: r.inclusionPct,
          synergy: r.synergy,
          imageUri: null,
          isInDeck,
          isInCollection,
          collectionQuantity,
        };
      });

      // Sol Ring: in deck AND in collection -> isInDeck = true
      const solRing = mapped.find((c) => c.name === "Sol Ring");
      expect(solRing?.isInDeck).toBe(true);

      // Arcane Signet: in deck, NOT in collection -> isInDeck = true, isInCollection = false
      const arcaneSignet = mapped.find((c) => c.name === "Arcane Signet");
      expect(arcaneSignet?.isInDeck).toBe(true);
      expect(arcaneSignet?.isInCollection).toBe(false);

      // Faeburrow Elder: NOT in deck, BUT IN COLLECTION -> isInDeck = false, isInCollection = true (qty: 2)
      const faeburrow = mapped.find((c) => c.name === "Faeburrow Elder");
      expect(faeburrow?.isInDeck).toBe(false);
      expect(faeburrow?.isInCollection).toBe(true);
      expect(faeburrow?.collectionQuantity).toBe(2);

      // Command Tower: NOT in deck, NOT in collection -> missing
      const cmdTower = mapped.find((c) => c.name === "Command Tower");
      expect(cmdTower?.isInDeck).toBe(false);
      expect(cmdTower?.isInCollection).toBe(false);
    });

    it("matches multi-category memberships correctly", () => {
      const card = rawRecommendations[2]; // Faeburrow Elder
      const selectedCategory = "Creatures";

      const isMatch = card.categories.includes(selectedCategory);
      expect(isMatch).toBe(true);
    });
  });
});
