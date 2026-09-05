import { describe, it, expect } from "vitest";
import {
  DeckCreateSchema,
  DeckUpdateSchema,
  DeckCardCreateSchema,
  CollectionCardCreateSchema,
} from "@/lib/schemas";

describe("Zod Validation Schemas", () => {
  describe("DeckCreateSchema", () => {
    it("should accept valid deck creation input", () => {
      const input = {
        name: "Urza Modern Deck",
        format: "Modern",
        description: "Artifacts combo",
      };
      const result = DeckCreateSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Urza Modern Deck");
        expect(result.data.format).toBe("Modern");
      }
    });

    it("should apply default format 'Commander' if omitted", () => {
      const input = { name: "Casual Deck" };
      const result = DeckCreateSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.format).toBe("Commander");
      }
    });

    it("should reject empty deck name", () => {
      const input = { name: "" };
      const result = DeckCreateSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("DeckCardCreateSchema", () => {
    it("should accept valid card to deck input", () => {
      const input = {
        cardScryfallId: "f46014e7-be13-4cf1-a06a-eb9b222fbdfa",
        cardName: "Black Lotus",
        quantity: 1,
        manaCost: "{0}",
        typeLine: "Artifact",
      };
      const result = DeckCardCreateSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isSideboard).toBe(false);
      }
    });

    it("should reject quantity less than 1", () => {
      const input = {
        cardScryfallId: "id-123",
        cardName: "Lightning Bolt",
        quantity: 0,
      };
      const result = DeckCardCreateSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("CollectionCardCreateSchema", () => {
    it("should accept valid collection card input", () => {
      const input = {
        cardScryfallId: "scryfall-uuid-456",
        cardName: "Sol Ring",
        quantity: 3,
        setCode: "c21",
        collectorNumber: "263",
      };
      const result = CollectionCardCreateSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(3);
        expect(result.data.setCode).toBe("c21");
      }
    });
  });
});
