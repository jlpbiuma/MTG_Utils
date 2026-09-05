import { describe, it, expect } from "vitest";
import {
  calculateCardmarketQuote,
  calculateCardTraderQuote,
  calculateMTGGoldfishQuote,
  getPriceSummary,
  PRICE_PROVIDERS,
} from "@/lib/pricing";

describe("Pricing Engine - Cardmarket, Card Trader & MTGGoldfish", () => {
  const sampleScryfallData = {
    id: "c4600000-0000-0000-0000-000000000001",
    name: "Sol Ring",
    prices: {
      eur: "1.50",
      eur_foil: "4.20",
      usd: "1.80",
      usd_foil: "5.10",
    },
    purchase_uris: {
      cardmarket: "https://www.cardmarket.com/en/Magic/Products/Singles/Sol-Ring",
      tcgplayer: "https://www.tcgplayer.com/product/123",
    },
  };

  it("should calculate Cardmarket quotes with trend, min, max and subtotal in EUR", () => {
    const quote = calculateCardmarketQuote(
      { name: "Sol Ring", quantity: 3 },
      sampleScryfallData
    );

    expect(quote.provider).toBe("cardmarket");
    expect(quote.currency).toBe("EUR");
    expect(quote.currencySymbol).toBe("€");
    expect(quote.unitPrice.trend).toBe(1.5);
    expect(quote.unitPrice.min).toBeLessThanOrEqual(1.5);
    expect(quote.unitPrice.max).toBe(4.2);
    expect(quote.subtotal).toBe(4.5); // 3 * 1.5
    expect(quote.purchaseUrl).toBe(sampleScryfallData.purchase_uris.cardmarket);
  });

  it("should calculate Card Trader quotes with trend, min, max in EUR", async () => {
    const quote = await calculateCardTraderQuote(
      { name: "Sol Ring", quantity: 2 },
      sampleScryfallData
    );

    expect(quote.provider).toBe("cardtrader");
    expect(quote.currency).toBe("EUR");
    expect(quote.currencySymbol).toBe("€");
    expect(quote.unitPrice.trend).toBeGreaterThan(0);
    expect(quote.unitPrice.min).toBeGreaterThan(0);
    expect(quote.unitPrice.max).toBeGreaterThanOrEqual(quote.unitPrice.trend);
    expect(quote.subtotal).toBe(Math.round(quote.unitPrice.trend * 2 * 100) / 100);
    expect(quote.purchaseUrl).toContain("cardtrader.com");
  });

  it("should calculate MTGGoldfish quotes with trend, min, max in USD", () => {
    const quote = calculateMTGGoldfishQuote(
      { name: "Sol Ring", quantity: 4 },
      sampleScryfallData
    );

    expect(quote.provider).toBe("mtggoldfish");
    expect(quote.currency).toBe("USD");
    expect(quote.currencySymbol).toBe("$");
    expect(quote.unitPrice.trend).toBe(1.8);
    expect(quote.unitPrice.min).toBeLessThanOrEqual(1.8);
    expect(quote.unitPrice.max).toBe(5.1);
    expect(quote.subtotal).toBe(7.2); // 4 * 1.8
    expect(quote.purchaseUrl).toContain("mtggoldfish.com");
  });

  it("should calculate complete price summary with total net value and missing cards value", async () => {
    const cards = [
      { name: "Sol Ring", quantity: 1, isMissing: false },
      { name: "Lightning Bolt", quantity: 4, isMissing: true },
    ];

    const summary = await getPriceSummary(cards, "cardmarket", true);

    expect(summary.provider).toBe("cardmarket");
    expect(summary.currency).toBe("EUR");
    expect(summary.totalCards).toBe(5);
    expect(summary.totalNetValue).toBeGreaterThan(0);
    expect(summary.totalMissingValue).toBeGreaterThan(0);
    expect(summary.totalOwnedValue).toBeGreaterThan(0);
    expect(summary.totalNetValue).toBe(
      Math.round((summary.totalOwnedValue! + summary.totalMissingValue!) * 100) / 100
    );
  });

  it("should support provider configurations for UI badges and selectors", () => {
    expect(PRICE_PROVIDERS.cardmarket.name).toContain("Cardmarket");
    expect(PRICE_PROVIDERS.cardmarket.currencySymbol).toBe("€");

    expect(PRICE_PROVIDERS.cardtrader.name).toContain("Card Trader");
    expect(PRICE_PROVIDERS.cardtrader.currencySymbol).toBe("€");

    expect(PRICE_PROVIDERS.mtggoldfish.name).toContain("MTGGoldfish");
    expect(PRICE_PROVIDERS.mtggoldfish.currencySymbol).toBe("$");
  });
});
