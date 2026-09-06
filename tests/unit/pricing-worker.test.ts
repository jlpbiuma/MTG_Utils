import { describe, it, expect } from "vitest";
import { runWeeklyCollectionPricingWorker } from "@/lib/pricing-worker";

describe("Weekly Collection Pricing Worker", () => {
  it("should run gracefully with rate limiting options and return summary", async () => {
    // Run with limit of 0 to verify execution signature without hitting remote network
    const result = await runWeeklyCollectionPricingWorker({ limit: 0, delayMs: 10 });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.totalCardsProcessed).toBe(0);
    expect(result.updatedCatalogCount).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
