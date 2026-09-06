import { PriceProvider, PriceSummary, CardPriceQuote, PRICE_PROVIDERS } from "./types";
import { calculateCardmarketQuote, RawScryfallPriceData } from "./cardmarket";
import { calculateCardTraderQuote } from "./cardtrader";
import { calculateMTGGoldfishQuote } from "./mtggoldfish";
import { normalizeCardName } from "@/lib/card-utils";


const SCRYFALL_COLLECTION_URL = "https://api.scryfall.com/cards/collection";
const SCRYFALL_HEADERS = {
  "User-Agent": "MTGUtils/1.0 (pricing-engine)",
  Accept: "application/json",
  "Content-Type": "application/json",
};

// In-memory cache for pricing data with 3-day TTL
interface CachedPriceEntry {
  quote: CardPriceQuote;
  timestamp: number;
}
export const priceCache = new Map<string, CachedPriceEntry>();
export const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days (259,200,000 ms)

export interface CardToPrice {
  name: string;
  scryfallId?: string;
  quantity?: number;
  isMissing?: boolean;
}

/**
 * Bulk fetches raw price data from Scryfall's /cards/collection endpoint.
 */
async function fetchRawPriceDataBulk(
  cards: CardToPrice[]
): Promise<Map<string, RawScryfallPriceData>> {
  const map = new Map<string, RawScryfallPriceData>();
  if (cards.length === 0) return map;

  const uniqueNames = Array.from(new Set(cards.map((c) => c.name.trim())));
  const CHUNK_SIZE = 75;

  for (let i = 0; i < uniqueNames.length; i += CHUNK_SIZE) {
    const batch = uniqueNames.slice(i, i + CHUNK_SIZE);
    const identifiers = batch.map((name) => ({ name }));

    try {
      const res = await fetch(SCRYFALL_COLLECTION_URL, {
        method: "POST",
        headers: SCRYFALL_HEADERS,
        body: JSON.stringify({ identifiers }),
        next: { revalidate: 1800 },
      });

      if (res.ok) {
        const json = await res.json();
        const data: RawScryfallPriceData[] = json.data || [];
        for (const item of data) {
          map.set(normalizeCardName(item.name), item);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch bulk price data for batch:", err);
    }
  }

  return map;
}

/**
 * Calculates unified price summary for a list of cards under the chosen provider.
 */
export async function getPriceSummary(
  cards: CardToPrice[],
  provider: PriceProvider = "cardmarket",
  bypassCache: boolean = false
): Promise<PriceSummary> {
  const config = PRICE_PROVIDERS[provider] || PRICE_PROVIDERS.cardmarket;

  const quotes: Record<string, CardPriceQuote> = {};
  let totalCards = 0;
  let totalNetValue = 0;
  let totalOwnedValue = 0;
  let totalMissingValue = 0;

  // Check cache for cards to avoid repeated external requests
  const uncachedCards: CardToPrice[] = [];
  const now = Date.now();

  for (const card of cards) {
    const key = `${provider}:${normalizeCardName(card.name)}`;
    const cached = priceCache.get(key);

    if (!bypassCache && cached && now - cached.timestamp < CACHE_TTL_MS) {
      const q = { ...cached.quote, quantity: card.quantity ?? 1 };
      q.subtotal = Math.round(q.unitPrice.trend * q.quantity * 100) / 100;
      quotes[normalizeCardName(card.name)] = q;
      if (card.scryfallId) {
        quotes[card.scryfallId] = q;
      }
    } else {
      uncachedCards.push(card);
    }
  }

  // Fetch missing price feeds from Scryfall if needed
  const rawPriceMap = uncachedCards.length > 0 ? await fetchRawPriceDataBulk(uncachedCards) : new Map();

  for (const card of uncachedCards) {
    const norm = normalizeCardName(card.name);
    const rawData = rawPriceMap.get(norm);

    let quote: CardPriceQuote;
    switch (provider) {
      case "cardtrader":
        quote = await calculateCardTraderQuote(card, rawData);
        break;
      case "mtggoldfish":
        quote = calculateMTGGoldfishQuote(card, rawData);
        break;
      case "cardmarket":
      default:
        quote = calculateCardmarketQuote(card, rawData);
        break;
    }

    quotes[norm] = quote;
    if (card.scryfallId) {
      quotes[card.scryfallId] = quote;
    }

    // Save to cache
    const cacheKey = `${provider}:${norm}`;
    priceCache.set(cacheKey, { quote, timestamp: now });
  }

  // Calculate overall totals
  for (const card of cards) {
    const norm = normalizeCardName(card.name);
    const q = quotes[norm] || quotes[card.scryfallId || ""];
    const qty = card.quantity ?? 1;
    const subtotal = q ? q.subtotal : 0;

    totalCards += qty;
    totalNetValue += subtotal;

    if (card.isMissing) {
      totalMissingValue += subtotal;
    } else {
      totalOwnedValue += subtotal;
    }
  }

  return {
    provider,
    currency: config.currency,
    currencySymbol: config.currencySymbol,
    totalCards,
    totalNetValue: Math.round(totalNetValue * 100) / 100,
    totalOwnedValue: Math.round(totalOwnedValue * 100) / 100,
    totalMissingValue: Math.round(totalMissingValue * 100) / 100,
    quotes,
  };
}

export * from "./types";
export * from "./cardmarket";
export * from "./cardtrader";
export * from "./mtggoldfish";
