import { describe, it, expect } from "vitest";
import { CACHE_TTL_MS } from "@/lib/pricing";
import { DeckUpdateSchema } from "@/lib/schemas";

describe("Pricing 3-Day Cache Policy & Deck Update Validation", () => {
  describe("3-Day Cache TTL Constant", () => {
    it("CACHE_TTL_MS is configured to exactly 3 days in milliseconds", () => {
      const threeDaysInMs = 3 * 24 * 60 * 60 * 1000; // 259,200,000 ms
      expect(CACHE_TTL_MS).toBe(threeDaysInMs);
      expect(CACHE_TTL_MS).toBe(259200000);
    });

    it("evaluates timestamp age against the 3-day threshold correctly", () => {
      const now = Date.now();
      const oneHourAgo = new Date(now - 60 * 60 * 1000);
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);
      const twoDaysTwentyThreeHoursAgo = new Date(now - (2 * 24 + 23) * 60 * 60 * 1000);
      const threeDaysOneHourAgo = new Date(now - (3 * 24 + 1) * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

      const isCacheValid = (updatedAt?: Date | null) => {
        if (!updatedAt) return false;
        return now - updatedAt.getTime() < CACHE_TTL_MS;
      };

      // Fresh (< 3 days): Should NOT refetch
      expect(isCacheValid(oneHourAgo)).toBe(true);
      expect(isCacheValid(oneDayAgo)).toBe(true);
      expect(isCacheValid(twoDaysAgo)).toBe(true);
      expect(isCacheValid(twoDaysTwentyThreeHoursAgo)).toBe(true);

      // Stale (>= 3 days): Should refetch
      expect(isCacheValid(threeDaysOneHourAgo)).toBe(false);
      expect(isCacheValid(sevenDaysAgo)).toBe(false);
      expect(isCacheValid(null)).toBe(false);
      expect(isCacheValid(undefined)).toBe(false);
    });
  });

  describe("DeckUpdateSchema", () => {
    it("validates a full deck update", () => {
      const result = DeckUpdateSchema.safeParse({
        name: "Omnath Landfall Storm",
        format: "Modern",
        description: "Competitive Modern Landfall deck",
      });
      expect(result.success).toBe(true);
    });

    it("validates partial deck updates", () => {
      const nameOnly = DeckUpdateSchema.safeParse({ name: "Updated Name" });
      expect(nameOnly.success).toBe(true);

      const formatOnly = DeckUpdateSchema.safeParse({ format: "Legacy" });
      expect(formatOnly.success).toBe(true);
    });

    it("rejects an empty name", () => {
      const emptyName = DeckUpdateSchema.safeParse({ name: "" });
      expect(emptyName.success).toBe(false);
    });
  });
});
