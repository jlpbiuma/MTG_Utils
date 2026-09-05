export type PriceProvider = "cardmarket" | "cardtrader" | "mtggoldfish";

export type Currency = "EUR" | "USD";

export interface UnitPriceBreakdown {
  trend: number;
  min: number;
  max: number;
}

export interface CardPriceQuote {
  cardName: string;
  scryfallId?: string;
  provider: PriceProvider;
  currency: Currency;
  currencySymbol: string;
  unitPrice: UnitPriceBreakdown;
  quantity: number;
  subtotal: number; // quantity * unitPrice.trend
  purchaseUrl?: string;
  lastUpdated: string;
}

export interface PriceSummary {
  provider: PriceProvider;
  currency: Currency;
  currencySymbol: string;
  totalCards: number;
  totalNetValue: number;      // Net total of all cards (trend price)
  totalOwnedValue?: number;   // Net total of owned cards
  totalMissingValue?: number; // Cost to complete the deck (missing cards only)
  quotes: Record<string, CardPriceQuote>; // Keyed by normalized name or scryfall ID
}

export interface PriceProviderConfig {
  name: string;
  id: PriceProvider;
  currency: Currency;
  currencySymbol: string;
  description: string;
  logoText: string;
}

export const PRICE_PROVIDERS: Record<PriceProvider, PriceProviderConfig> = {
  cardmarket: {
    id: "cardmarket",
    name: "Cardmarket (MKM)",
    currency: "EUR",
    currencySymbol: "€",
    description: "Referencia europea líder con precios promedio, mínimo y máximo en Euros.",
    logoText: "MKM",
  },
  cardtrader: {
    id: "cardtrader",
    name: "Card Trader",
    currency: "EUR",
    currencySymbol: "€",
    description: "Mercado global directo con cotizaciones de vendedores en tiempo real.",
    logoText: "CT",
  },
  mtggoldfish: {
    id: "mtggoldfish",
    name: "MTGGoldfish",
    currency: "USD",
    currencySymbol: "$",
    description: "Referencia de metajuego y mercado de papel estadounidense en Dólares.",
    logoText: "GF",
  },
};
