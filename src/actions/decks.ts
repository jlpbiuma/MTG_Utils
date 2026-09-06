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
 * Fetches single deck with full details and per-card owned/missing breakdown,
 * including cross-deck physical card assignment tracking.
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

  let allAssignedDeckCards: Array<{
    id: string;
    cardScryfallId: string;
    cardName: string;
    assignedQuantity: number;
    deckId: string;
    deck: { id: string; name: string };
  }> = [];

  try {
    allAssignedDeckCards = await prisma.deckCard.findMany({
      where: {
        deck: { userId },
        assignedQuantity: { gt: 0 },
      },
      include: {
        deck: {
          select: { id: true, name: true },
        },
      },
    });
  } catch (err) {
    console.warn("Retrying deckCard assignment query with in-memory filter:", err);
    try {
      const rawDeckCards = await prisma.deckCard.findMany({
        where: { deck: { userId } },
        include: {
          deck: {
            select: { id: true, name: true },
          },
        },
      });
      allAssignedDeckCards = rawDeckCards
        .filter((c) => ((c as any).assignedQuantity ?? 0) > 0)
        .map((c) => ({
          ...c,
          assignedQuantity: (c as any).assignedQuantity ?? 0,
        })) as typeof allAssignedDeckCards;
    } catch (fallbackErr) {
      console.warn("Fallback assignment query error:", fallbackErr);
    }
  }

  // Build lookup of assignments across all decks
  // key: normalizedName or scryfallId -> array of { deckId, deckName, quantity, cardId }
  const assignmentsByCard = new Map<
    string,
    Array<{ deckId: string; deckName: string; quantity: number; cardId: string }>
  >();


  for (const ac of allAssignedDeckCards) {
    const norm = ac.cardName.toLowerCase().trim().split(" // ")[0];
    const item = {
      deckId: ac.deck.id,
      deckName: ac.deck.name,
      quantity: ac.assignedQuantity,
      cardId: ac.id,
    };

    // Index by ID
    const byIdList = assignmentsByCard.get(ac.cardScryfallId) || [];
    byIdList.push(item);
    assignmentsByCard.set(ac.cardScryfallId, byIdList);

    // Index by normalized name
    const byNameList = assignmentsByCard.get(`name:${norm}`) || [];
    byNameList.push(item);
    assignmentsByCard.set(`name:${norm}`, byNameList);
  }

  const totalCards = deck.cards.reduce((sum, c) => sum + c.quantity, 0);
  const uniqueCards = deck.cards.length;

  let ownedCards = 0;
  const cardsWithOwnership: DeckCardWithOwnership[] = deck.cards.map((c) => {
    const norm = c.cardName.toLowerCase().trim().split(" // ")[0];
    const ownedInCollection =
      collectionMaps.byId.get(c.cardScryfallId) || collectionMaps.byName.get(norm) || 0;
    const effectiveOwned = Math.min(ownedInCollection, c.quantity);
    ownedCards += effectiveOwned;
    const missingCount = Math.max(0, c.quantity - ownedInCollection);

    // Get all assignments for this card
    const cardAssignments =
      assignmentsByCard.get(c.cardScryfallId) ||
      assignmentsByCard.get(`name:${norm}`) ||
      [];

    // Filter out duplicates (if card matched both by ID and Name)
    const distinctAssignmentsMap = new Map<string, { deckId: string; deckName: string; quantity: number }>();
    for (const a of cardAssignments) {
      const existing = distinctAssignmentsMap.get(a.cardId);
      if (!existing) {
        distinctAssignmentsMap.set(a.cardId, {
          deckId: a.deckId,
          deckName: a.deckName,
          quantity: a.quantity,
        });
      }
    }
    const distinctAssignments = Array.from(distinctAssignmentsMap.values());

    // Total assigned across ALL decks
    const totalAssignedAcrossAllDecks = distinctAssignments.reduce(
      (sum, a) => sum + a.quantity,
      0
    );

    // Available unassigned copies in physical collection
    const availableToAssign = Math.max(0, ownedInCollection - totalAssignedAcrossAllDecks);

    // Assigned in OTHER decks (excluding this deck)
    const assignedInOtherDecks = distinctAssignments.filter((a) => a.deckId !== deckId);

    return {
      id: c.id,
      deckId: c.deckId,
      cardScryfallId: c.cardScryfallId,
      cardName: c.cardName,
      quantity: c.quantity,
      assignedQuantity: c.assignedQuantity ?? 0,
      isSideboard: c.isSideboard,
      manaCost: c.manaCost,
      typeLine: c.typeLine,
      imageUri: c.imageUri,
      ownedInCollection,
      availableToAssign,
      assignedInOtherDecks,
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

/**
 * Assigns one or more physical card copies from the user's collection to a specific deck.
 */
export async function assignCardToDeck(deckCardId: string, quantityToAssign: number = 1) {
  const userId = await getCurrentUserId();

  const card = await prisma.deckCard.findUnique({
    where: { id: deckCardId },
    include: { deck: true },
  });

  if (!card || card.deck.userId !== userId) {
    throw new Error("Carta o mazo no encontrado.");
  }

  const norm = card.cardName.toLowerCase().trim().split(" // ")[0];

  // Check total owned in collection
  const collectionCards = await prisma.collectionCard.findMany({
    where: {
      userId,
      OR: [
        { cardScryfallId: card.cardScryfallId },
        { cardName: { equals: card.cardName, mode: "insensitive" } },
      ],
    },
  });

  const ownedInCollection = collectionCards.reduce((sum, c) => sum + c.quantity, 0);

  // Check total assigned across all decks
  const matchingCards = await prisma.deckCard.findMany({
    where: {
      deck: { userId },
      OR: [
        { cardScryfallId: card.cardScryfallId },
        { cardName: { equals: card.cardName, mode: "insensitive" } },
      ],
    },
  });

  const totalAssigned = matchingCards
    .filter((c) => ((c as any).assignedQuantity ?? 0) > 0)
    .reduce((sum, c) => sum + ((c as any).assignedQuantity ?? 0), 0);
  const availableToAssign = Math.max(0, ownedInCollection - totalAssigned);


  if (availableToAssign <= 0) {
    throw new Error("No hay copias libres disponibles en tu colección física para asignar.");
  }

  const neededInDeck = Math.max(0, card.quantity - card.assignedQuantity);
  const amountToAssign = Math.min(quantityToAssign, availableToAssign, neededInDeck);

  if (amountToAssign <= 0) {
    return card;
  }

  const updated = await prisma.deckCard.update({
    where: { id: deckCardId },
    data: {
      assignedQuantity: card.assignedQuantity + amountToAssign,
    },
  });

  revalidatePath("/decks");
  revalidatePath(`/decks/${card.deckId}`);
  return updated;
}

/**
 * Unassigns/releases one or more physical card copies from a deck back to the collection pool.
 */
export async function unassignCardFromDeck(deckCardId: string, quantityToUnassign: number = 1) {
  const userId = await getCurrentUserId();

  const card = await prisma.deckCard.findUnique({
    where: { id: deckCardId },
    include: { deck: true },
  });

  if (!card || card.deck.userId !== userId) {
    throw new Error("Carta o mazo no encontrado.");
  }

  const amountToUnassign = Math.min(quantityToUnassign, card.assignedQuantity);
  if (amountToUnassign <= 0) return card;

  const updated = await prisma.deckCard.update({
    where: { id: deckCardId },
    data: {
      assignedQuantity: Math.max(0, card.assignedQuantity - amountToUnassign),
    },
  });

  revalidatePath("/decks");
  revalidatePath(`/decks/${card.deckId}`);
  return updated;
}

/**
 * Transfers/reassigns physical copies from one deck directly to another deck.
 */
export async function reassignCardToDeck(
  fromDeckId: string,
  toDeckCardId: string,
  cardName: string,
  quantityToTransfer: number = 1
) {
  const userId = await getCurrentUserId();

  const [toCard, fromCard] = await Promise.all([
    prisma.deckCard.findUnique({
      where: { id: toDeckCardId },
      include: { deck: true },
    }),
    prisma.deckCard.findFirst({
      where: {
        deckId: fromDeckId,
        deck: { userId },
        cardName: { equals: cardName, mode: "insensitive" },
        assignedQuantity: { gt: 0 },
      },
    }),
  ]);

  if (!toCard || toCard.deck.userId !== userId) {
    throw new Error("Mazo destino no encontrado.");
  }

  if (!fromCard) {
    throw new Error("No se encontró la carta asignada en el mazo origen.");
  }

  const actualTransfer = Math.min(
    quantityToTransfer,
    fromCard.assignedQuantity,
    Math.max(0, toCard.quantity - toCard.assignedQuantity)
  );

  if (actualTransfer <= 0) return;

  await prisma.$transaction([
    prisma.deckCard.update({
      where: { id: fromCard.id },
      data: { assignedQuantity: fromCard.assignedQuantity - actualTransfer },
    }),
    prisma.deckCard.update({
      where: { id: toCard.id },
      data: { assignedQuantity: toCard.assignedQuantity + actualTransfer },
    }),
  ]);

  revalidatePath("/decks");
  revalidatePath(`/decks/${toCard.deckId}`);
  revalidatePath(`/decks/${fromDeckId}`);
}

