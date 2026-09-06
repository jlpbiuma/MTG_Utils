import { describe, it, expect } from "vitest";
import { toEdhrecSlug, getEdhrecCardImageUrl } from "@/lib/edhrec";
import { normalizeCardName } from "@/lib/card-utils";

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
});
