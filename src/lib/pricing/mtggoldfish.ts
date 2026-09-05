import { CardPriceQuote, UnitPriceBreakdown } from "./types";
import { RawScryfallPriceData } from "./cardmarket";

/**
 * Calculates MTGGoldfish (USD) price quotes for cards.
 * Uses official paper market pricing feeds (usd, usd_foil) and links to MTGGoldfish.
 */
export function calculateMTGGoldfishQuote(
  card: { name: string; scryfallId?: string; quantity?: number },
  scryfallData?: RawScryfallPriceData
): CardPriceQuote {
  const quantity = card.quantity ?? 1;
  const rawUsd = scryfallData?.prices?.usd ? parseFloat(scryfallData.prices.usd) : null;
  const rawUsdFoil = scryfallData?.prices?.usd_foil ? parseFloat(scryfallData.prices.usd_foil) : null;

  // Trend paper price in USD
  const trend = rawUsd && !isNaN(rawUsd) && rawUsd > 0 ? Math.round(rawUsd * 100) / 100 : 0.25;
  // Estimated minimum floor price
  const min = Math.max(0.05, Math.round(trend * 0.75 * 100) / 100);
  // Estimated max (foil or high grade)
  const max =
    rawUsdFoil && !isNaN(rawUsdFoil) && rawUsdFoil > trend
      ? Math.round(rawUsdFoil * 100) / 100
      : Math.round(trend * 2.4 * 100) / 100;

  const unitPrice: UnitPriceBreakdown = {
    trend,
    min,
    max,
  };

  const subtotal = Math.round(trend * quantity * 100) / 100;

  // Format card name for MTGGoldfish URL
  const slug = encodeURIComponent(card.name.replace(/\s+/g, "+"));
  const purchaseUrl = `https://www.mtggoldfish.com/q?query_string=${slug}`;

  return {
    cardName: card.name,
    scryfallId: card.scryfallId || scryfallData?.id,
    provider: "mtggoldfish",
    currency: "USD",
    currencySymbol: "$",
    unitPrice,
    quantity,
    subtotal,
    purchaseUrl,
    lastUpdated: new Date().toISOString(),
  };
}
