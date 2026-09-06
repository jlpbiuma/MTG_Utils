/**
 * Pure card string utilities and type categorization safe for both client and server environments.
 * Contains NO server, database, or Prisma dependencies.
 */

import { PriceSummary } from "@/lib/pricing/types";

export function normalizeCardName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .split(" // ")[0]; // Front face for dual/split cards
}

export type CardTypeCategory =
  | "creatures"
  | "planeswalkers"
  | "instants"
  | "sorceries"
  | "artifacts"
  | "enchantments"
  | "battles"
  | "lands"
  | "other";

export interface CardTypeGroupInfo {
  key: CardTypeCategory;
  label: string;
  order: number;
}

export const CARD_TYPE_GROUPS: Record<CardTypeCategory, CardTypeGroupInfo> = {
  creatures: { key: "creatures", label: "Criaturas", order: 1 },
  planeswalkers: { key: "planeswalkers", label: "Planeswalkers", order: 2 },
  instants: { key: "instants", label: "Instantáneos", order: 3 },
  sorceries: { key: "sorceries", label: "Conjuros", order: 4 },
  artifacts: { key: "artifacts", label: "Artefactos", order: 5 },
  enchantments: { key: "enchantments", label: "Encantamientos", order: 6 },
  battles: { key: "battles", label: "Batallas", order: 7 },
  lands: { key: "lands", label: "Tierras", order: 8 },
  other: { key: "other", label: "Otras Cartas", order: 9 },
};

/**
 * Categorizes an MTG card based on its type_line.
 * Follows MTG convention where creature types take precedence (e.g. Artifact Creatures -> Criaturas).
 */
export function getCardCategory(typeLine?: string | null): CardTypeCategory {
  if (!typeLine) return "other";
  const lower = typeLine.toLowerCase();

  // Creature takes precedence for Artifact Creatures / Enchantment Creatures
  if (lower.includes("creature") || lower.includes("criatura")) return "creatures";
  if (lower.includes("planeswalker")) return "planeswalkers";
  if (lower.includes("instant") || lower.includes("instantáneo")) return "instants";
  if (lower.includes("sorcery") || lower.includes("conjuro")) return "sorceries";
  if (lower.includes("artifact") || lower.includes("artefacto")) return "artifacts";
  if (lower.includes("enchantment") || lower.includes("encantamiento")) return "enchantments";
  if (lower.includes("battle") || lower.includes("batalla")) return "battles";
  if (lower.includes("land") || lower.includes("tierra")) return "lands";

  return "other";
}

export interface GroupedCardSection<T> {
  key: CardTypeCategory;
  label: string;
  order: number;
  cards: T[];
  totalCards: number;
  uniqueCards: number;
  ownedCards: number;
  missingCards: number;
  completionPercentage: number;
  sectionTotalPrice: number;
  sectionMissingPrice: number;
  currencySymbol: string;
}

/**
 * Groups an array of deck cards by card type and computes section-level stats:
 * total card count, owned count, completion %, and section net market price.
 */
export function groupCardsByType<
  T extends {
    cardName: string;
    cardScryfallId?: string;
    typeLine?: string | null;
    quantity: number;
    ownedInCollection?: number;
    missingCount?: number;
  }
>(cards: T[], priceSummary?: PriceSummary | null): GroupedCardSection<T>[] {
  const buckets = new Map<CardTypeCategory, T[]>();

  for (const card of cards) {
    const cat = getCardCategory(card.typeLine);
    const list = buckets.get(cat) || [];
    list.push(card);
    buckets.set(cat, list);
  }

  const sections: GroupedCardSection<T>[] = [];
  const currencySymbol = priceSummary?.currencySymbol || "€";

  for (const [catKey, groupInfo] of Object.entries(CARD_TYPE_GROUPS)) {
    const cat = catKey as CardTypeCategory;
    const catCards = buckets.get(cat);
    if (!catCards || catCards.length === 0) continue;

    let totalCards = 0;
    let ownedCards = 0;
    let missingCards = 0;
    let sectionTotalPrice = 0;
    let sectionMissingPrice = 0;

    for (const card of catCards) {
      totalCards += card.quantity;
      const owned = card.ownedInCollection ?? 0;
      const effectiveOwned = Math.min(owned, card.quantity);
      ownedCards += effectiveOwned;
      const missing = card.missingCount ?? Math.max(0, card.quantity - owned);
      missingCards += missing;

      // Price calculation
      const norm = normalizeCardName(card.cardName);
      const quote =
        (card.cardScryfallId ? priceSummary?.quotes[card.cardScryfallId] : undefined) ||
        priceSummary?.quotes[norm];

      const trend = quote?.unitPrice?.trend ?? 0;
      sectionTotalPrice += trend * card.quantity;
      sectionMissingPrice += trend * missing;
    }

    const completionPercentage =
      totalCards > 0 ? Math.round((ownedCards / totalCards) * 1000) / 10 : 0;

    sections.push({
      key: cat,
      label: groupInfo.label,
      order: groupInfo.order,
      cards: catCards,
      totalCards,
      uniqueCards: catCards.length,
      ownedCards,
      missingCards,
      completionPercentage,
      sectionTotalPrice: Math.round(sectionTotalPrice * 100) / 100,
      sectionMissingPrice: Math.round(sectionMissingPrice * 100) / 100,
      currencySymbol,
    });
  }

  return sections.sort((a, b) => a.order - b.order);
}
