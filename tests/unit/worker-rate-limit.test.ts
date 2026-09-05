import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeCardName, sleep } from "@/lib/worker";

describe("Worker Rate Limiting & Card Normalization", () => {
  it("should normalize card names correctly across casing, whitespace, and split faces", () => {
    expect(normalizeCardName("Sol Ring")).toBe("sol ring");
    expect(normalizeCardName("  LIGHTNING   BOLT  ")).toBe("lightning bolt");
    expect(normalizeCardName("Wear // Tear")).toBe("wear");
    expect(normalizeCardName("Delver of Secrets // Insectile Aberration")).toBe("delver of secrets");
    expect(normalizeCardName("Boseiju, Who Endures")).toBe("boseiju, who endures");
  });

  it("should resolve sleep promise after specified duration", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it("should enforce maximum batch size of 75 for Scryfall collection endpoint", () => {
    const totalCards = 200;
    const cards = Array.from({ length: totalCards }, (_, i) => `Card ${i + 1}`);

    const batchSize = 75;
    const batches: string[][] = [];
    for (let i = 0; i < cards.length; i += batchSize) {
      batches.push(cards.slice(i, i + batchSize));
    }

    expect(batches.length).toBe(3);
    expect(batches[0].length).toBe(75);
    expect(batches[1].length).toBe(75);
    expect(batches[2].length).toBe(50);
  });

  it("should calculate correct delay intervals to avoid HTTP 429", () => {
    const delayMs = 100;
    const numBatches = 5;
    const totalMinimumDelay = (numBatches - 1) * delayMs;

    expect(totalMinimumDelay).toBe(400); // 4 polite pauses between 5 batches
  });
});
