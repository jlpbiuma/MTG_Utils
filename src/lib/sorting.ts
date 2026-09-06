import { normalizeCardName } from "@/lib/worker";
import { PriceSummary } from "@/lib/pricing";

export type SortField = "name" | "price_trend" | "price_subtotal" | "cmc" | "type" | "quantity" | "status";
export type SortDirection = "asc" | "desc";

/**
 * Calculates Converted Mana Cost (CMC / Mana Value) from a mana string like "{2}{U}{B}".
 */
export function extractCmc(manaCost?: string | null): number {
  if (!manaCost) return 0;
  let cmc = 0;
  const symbols = manaCost.match(/\{([^}]+)\}/g) || [];

  for (const sym of symbols) {
    const inner = sym.replace(/[{}]/g, "");
    const num = parseInt(inner, 10);
    if (!isNaN(num)) {
      cmc += num;
    } else if (inner !== "X" && inner !== "Y" && inner !== "Z") {
      cmc += 1;
    }
  }

  return cmc;
}

export interface SortableCard {
  cardName: string;
  cardScryfallId: string;
  quantity: number;
  manaCost?: string | null;
  typeLine?: string | null;
  assignedQuantity?: number;
  ownedInCollection?: number;
  missingCount?: number;
}

/**
 * Sorts an array of cards based on the specified sortField, sortDirection, and current price quotes.
 */
export function sortCards<T extends SortableCard>(
  cards: T[],
  field: SortField,
  direction: SortDirection,
  priceSummary?: PriceSummary | null
): T[] {
  const sorted = [...cards];
  const multiplier = direction === "asc" ? 1 : -1;

  return sorted.sort((a, b) => {
    switch (field) {
      case "name": {
        return multiplier * a.cardName.localeCompare(b.cardName);
      }

      case "cmc": {
        const cmcA = extractCmc(a.manaCost);
        const cmcB = extractCmc(b.manaCost);
        if (cmcA !== cmcB) return multiplier * (cmcA - cmcB);
        return a.cardName.localeCompare(b.cardName);
      }

      case "type": {
        const typeA = a.typeLine || "";
        const typeB = b.typeLine || "";
        if (typeA !== typeB) return multiplier * typeA.localeCompare(typeB);
        return a.cardName.localeCompare(b.cardName);
      }

      case "quantity": {
        if (a.quantity !== b.quantity) return multiplier * (a.quantity - b.quantity);
        return a.cardName.localeCompare(b.cardName);
      }

      case "price_trend": {
        const quoteA =
          priceSummary?.quotes[a.cardScryfallId] ||
          priceSummary?.quotes[normalizeCardName(a.cardName)];
        const quoteB =
          priceSummary?.quotes[b.cardScryfallId] ||
          priceSummary?.quotes[normalizeCardName(b.cardName)];

        const priceA = quoteA?.unitPrice.trend ?? 0;
        const priceB = quoteB?.unitPrice.trend ?? 0;

        if (priceA !== priceB) return multiplier * (priceA - priceB);
        return a.cardName.localeCompare(b.cardName);
      }

      case "price_subtotal": {
        const quoteA =
          priceSummary?.quotes[a.cardScryfallId] ||
          priceSummary?.quotes[normalizeCardName(a.cardName)];
        const quoteB =
          priceSummary?.quotes[b.cardScryfallId] ||
          priceSummary?.quotes[normalizeCardName(b.cardName)];

        const subA = quoteA?.subtotal ?? (quoteA?.unitPrice.trend ?? 0) * a.quantity;
        const subB = quoteB?.subtotal ?? (quoteB?.unitPrice.trend ?? 0) * b.quantity;

        if (subA !== subB) return multiplier * (subA - subB);
        return a.cardName.localeCompare(b.cardName);
      }

      case "status": {
        // Missing cards first if asc, or assigned first
        const missingA = a.missingCount ?? 0;
        const missingB = b.missingCount ?? 0;
        if (missingA !== missingB) return multiplier * (missingB - missingA);

        const assignedA = a.assignedQuantity ?? 0;
        const assignedB = b.assignedQuantity ?? 0;
        if (assignedA !== assignedB) return multiplier * (assignedB - assignedA);

        return a.cardName.localeCompare(b.cardName);
      }

      default:
        return 0;
    }
  });
}
