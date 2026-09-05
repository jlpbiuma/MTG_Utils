import { CardPriceQuote, UnitPriceBreakdown } from "./types";

export interface RawScryfallPriceData {
  id: string;
  name: string;
  prices?: {
    eur?: string | null;
    eur_foil?: string | null;
    usd?: string | null;
    usd_foil?: string | null;
  };
  purchase_uris?: {
    cardmarket?: string | null;
    tcgplayer?: string | null;
  };
}

/**
 * Calculates Cardmarket (EUR) price quotes for cards.
 * Uses official Cardmarket price feeds (eur, eur_foil) provided via Scryfall.
 */
export function calculateCardmarketQuote(
  card: { name: string; scryfallId?: string; quantity?: number },
  scryfallData?: RawScryfallPriceData
): CardPriceQuote {
  const quantity = card.quantity ?? 1;
  const rawEur = scryfallData?.prices?.eur ? parseFloat(scryfallData.prices.eur) : null;
  const rawEurFoil = scryfallData?.prices?.eur_foil ? parseFloat(scryfallData.prices.eur_foil) : null;

  // Baseline trend price
  const trend = rawEur && !isNaN(rawEur) && rawEur > 0 ? Math.round(rawEur * 100) / 100 : 0.15;
  // Estimated market minimum (lowest available condition/listing floor)
  const min = Math.max(0.02, Math.round(trend * 0.72 * 100) / 100);
  // Estimated maximum (foil, special version or NM premium)
  const max =
    rawEurFoil && !isNaN(rawEurFoil) && rawEurFoil > trend
      ? Math.round(rawEurFoil * 100) / 100
      : Math.round(trend * 2.3 * 100) / 100;

  const unitPrice: UnitPriceBreakdown = {
    trend,
    min,
    max,
  };

  const subtotal = Math.round(trend * quantity * 100) / 100;
  const purchaseUrl =
    scryfallData?.purchase_uris?.cardmarket ||
    `https://www.cardmarket.com/en/Magic/Products/Singles?searchString=${encodeURIComponent(card.name)}`;

  return {
    cardName: card.name,
    scryfallId: card.scryfallId || scryfallData?.id,
    provider: "cardmarket",
    currency: "EUR",
    currencySymbol: "€",
    unitPrice,
    quantity,
    subtotal,
    purchaseUrl,
    lastUpdated: new Date().toISOString(),
  };
}
