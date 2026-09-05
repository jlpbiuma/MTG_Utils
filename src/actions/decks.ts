"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "./auth";
import {
  DeckCreateInput,
  DeckCreateSchema,
  DeckUpdateInput,
  DeckUpdateSchema,
  DeckCardCreateInput,
  DeckCardCreateSchema,
  DeckWithCompletion,
  DeckDetailWithStats,
  DeckCardWithOwnership,
} from "@/lib/schemas";

interface CollectionLookupMaps {
  byId: Map<string, number>;
  byName: Map<string, number>;
}

/**
 * Builds fast lookup maps of { cardScryfallId: quantity } and { normalizedName: quantity } from user's collection.
 */
async function getUserCollectionMap(userId: string): Promise<CollectionLookupMaps> {
  const collection = await prisma.collectionCard.findMany({
    where: { userId },
    select: { cardScryfallId: true, cardName: true, quantity: true },
  });

  const byId = new Map<string, number>();
  const byName = new Map<string, number>();

  for (const item of collection) {
    byId.set(item.cardScryfallId, item.quantity);
    const norm = item.cardName.toLowerCase().trim().split(" // ")[0];
    byName.set(norm, (byName.get(norm) || 0) + item.quantity);
  }

  return { byId, byName };
}

export async function getDecksWithCompletion(): Promise<DeckWithCompletion[]> {
  try {
    const userId = await getCurrentUserId();

    const [decks, collectionMaps] = await Promise.all([
      prisma.deck.findMany({
        where: { userId },
        include: { cards: true },
        orderBy: { updatedAt: "desc" },
      }),
      getUserCollectionMap(userId),
    ]);

    return decks.map((deck) => {
      const totalCards = deck.cards.reduce((sum, c) => sum + c.quantity, 0);
      const uniqueCards = deck.cards.length;

      const ownedCards = deck.cards.reduce((sum, c) => {
        const norm = c.cardName.toLowerCase().trim().split(" // ")[0];
        const owned = collectionMaps.byId.get(c.cardScryfallId) || collectionMaps.byName.get(norm) || 0;
        return sum + Math.min(owned, c.quantity);
      }, 0);

      const missingCardsCount = Math.max(0, totalCards - ownedCards);
      const completionPercentage =
        totalCards > 0 ? Math.round((ownedCards / totalCards) * 1000) / 10 : 0;

      return {
        id: deck.id,
        userId: deck.userId,
        name: deck.name,
        format: deck.format,
        description: deck.description,
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt,
        totalCards,
        uniqueCards,
        ownedCards,
        missingCardsCount,
        completionPercentage,
      };
    });
  } catch (error) {
    console.error("❌ Error in getDecksWithCompletion (Database query failed):", error);
    throw error;
  }
}

/**
 * Fetches single deck with full details and per-card owned/missing breakdown.
 */
export async function getDeckDetail(deckId: string): Promise<DeckDetailWithStats | null> {
  const userId = await getCurrentUserId();

  const [deck, collectionMaps] = await Promise.all([
    prisma.deck.findFirst({
      where: { id: deckId, userId },
      include: {
        cards: {
          orderBy: { cardName: "asc" },
        },
      },
    }),
    getUserCollectionMap(userId),
  ]);

  if (!deck) return null;

  const totalCards = deck.cards.reduce((sum, c) => sum + c.quantity, 0);
  const uniqueCards = deck.cards.length;

  let ownedCards = 0;
  const cardsWithOwnership: DeckCardWithOwnership[] = deck.cards.map((c) => {
    const norm = c.cardName.toLowerCase().trim().split(" // ")[0];
    const ownedInCollection = collectionMaps.byId.get(c.cardScryfallId) || collectionMaps.byName.get(norm) || 0;
    const effectiveOwned = Math.min(ownedInCollection, c.quantity);
    ownedCards += effectiveOwned;
    const missingCount = Math.max(0, c.quantity - ownedInCollection);

    return {
      id: c.id,
      deckId: c.deckId,
      cardScryfallId: c.cardScryfallId,
      cardName: c.cardName,
      quantity: c.quantity,
      isSideboard: c.isSideboard,
      manaCost: c.manaCost,
      typeLine: c.typeLine,
      imageUri: c.imageUri,
      ownedInCollection,
      missingCount,
    };
  });

  const missingCardsCount = Math.max(0, totalCards - ownedCards);
  const completionPercentage =
    totalCards > 0 ? Math.round((ownedCards / totalCards) * 1000) / 10 : 0;

  return {
    id: deck.id,
    userId: deck.userId,
    name: deck.name,
    format: deck.format,
    description: deck.description,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
    totalCards,
    uniqueCards,
    ownedCards,
    missingCardsCount,
    completionPercentage,
    cards: cardsWithOwnership,
  };
}

export async function createDeck(input: DeckCreateInput) {
  const userId = await getCurrentUserId();
  const validated = DeckCreateSchema.parse(input);

  const deck = await prisma.deck.create({
    data: {
      userId,
      name: validated.name,
      format: validated.format,
      description: validated.description,
    },
  });

  revalidatePath("/decks");
  return deck;
}

export async function updateDeck(deckId: string, input: DeckUpdateInput) {
  const userId = await getCurrentUserId();
  const validated = DeckUpdateSchema.parse(input);

  const deck = await prisma.deck.updateMany({
    where: { id: deckId, userId },
    data: validated,
  });

  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}`);
  return deck;
}

export async function deleteDeck(deckId: string) {
  const userId = await getCurrentUserId();

  await prisma.deck.deleteMany({
    where: { id: deckId, userId },
  });

  revalidatePath("/decks");
}

export async function addCardToDeck(deckId: string, input: DeckCardCreateInput) {
  const userId = await getCurrentUserId();
  const validated = DeckCardCreateSchema.parse(input);

  // Verify ownership
  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
  });
  if (!deck) throw new Error("Deck not found");

  const existing = await prisma.deckCard.findUnique({
    where: {
      deckId_cardScryfallId_isSideboard: {
        deckId,
        cardScryfallId: validated.cardScryfallId,
        isSideboard: validated.isSideboard,
      },
    },
  });

  if (existing) {
    const updated = await prisma.deckCard.update({
      where: { id: existing.id },
      data: {
        quantity: existing.quantity + validated.quantity,
        imageUri: validated.imageUri || existing.imageUri,
      },
    });
    revalidatePath("/decks");
    revalidatePath(`/decks/${deckId}`);
    return updated;
  }

  const created = await prisma.deckCard.create({
    data: {
      deckId,
      cardScryfallId: validated.cardScryfallId,
      cardName: validated.cardName,
      quantity: validated.quantity,
      isSideboard: validated.isSideboard,
      manaCost: validated.manaCost,
      typeLine: validated.typeLine,
      imageUri: validated.imageUri,
    },
  });

  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}`);
  return created;
}

export async function updateDeckCardQuantity(cardId: string, quantity: number) {
  const userId = await getCurrentUserId();

  const card = await prisma.deckCard.findUnique({
    where: { id: cardId },
    include: { deck: true },
  });

  if (!card || card.deck.userId !== userId) {
    throw new Error("Card or deck not found");
  }

  if (quantity <= 0) {
    await prisma.deckCard.delete({ where: { id: cardId } });
  } else {
    await prisma.deckCard.update({
      where: { id: cardId },
      data: { quantity },
    });
  }

  revalidatePath("/decks");
  revalidatePath(`/decks/${card.deckId}`);
}

export async function removeCardFromDeck(cardId: string) {
  const userId = await getCurrentUserId();

  const card = await prisma.deckCard.findUnique({
    where: { id: cardId },
    include: { deck: true },
  });

  if (!card || card.deck.userId !== userId) {
    throw new Error("Card or deck not found");
  }

  await prisma.deckCard.delete({ where: { id: cardId } });

  revalidatePath("/decks");
  revalidatePath(`/decks/${card.deckId}`);
}
