"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "./auth";
import { CollectionCardCreateInput, CollectionCardCreateSchema } from "@/lib/schemas";

export async function getUserCollection(searchQuery?: string) {
  const userId = await getCurrentUserId();

  const whereClause: {
    userId: string;
    cardName?: { contains: string; mode: "insensitive" };
  } = {
    userId,
  };

  if (searchQuery && searchQuery.trim().length > 0) {
    whereClause.cardName = {
      contains: searchQuery.trim(),
      mode: "insensitive",
    };
  }

  const cards = await prisma.collectionCard.findMany({
    where: whereClause,
    orderBy: { cardName: "asc" },
  });

  return cards;
}

export async function getCollectionStats() {
  const userId = await getCurrentUserId();

  const cards = await prisma.collectionCard.findMany({
    where: { userId },
    select: { quantity: true },
  });

  const uniqueCards = cards.length;
  const totalCards = cards.reduce((sum, c) => sum + c.quantity, 0);

  return { uniqueCards, totalCards };
}

export async function addOrIncrementCard(input: CollectionCardCreateInput) {
  const userId = await getCurrentUserId();
  const validated = CollectionCardCreateSchema.parse(input);

  const existing = await prisma.collectionCard.findUnique({
    where: {
      userId_cardScryfallId: {
        userId,
        cardScryfallId: validated.cardScryfallId,
      },
    },
  });

  if (existing) {
    const updated = await prisma.collectionCard.update({
      where: { id: existing.id },
      data: {
        quantity: existing.quantity + validated.quantity,
        imageUri: validated.imageUri || existing.imageUri,
      },
    });
    revalidatePath("/collection");
    revalidatePath("/decks");
    return updated;
  }

  const created = await prisma.collectionCard.create({
    data: {
      userId,
      cardScryfallId: validated.cardScryfallId,
      cardName: validated.cardName,
      quantity: validated.quantity,
      setCode: validated.setCode,
      collectorNumber: validated.collectorNumber,
      manaCost: validated.manaCost,
      typeLine: validated.typeLine,
      imageUri: validated.imageUri,
    },
  });

  revalidatePath("/collection");
  revalidatePath("/decks");
  return created;
}

export async function updateCollectionQuantity(cardId: string, quantity: number) {
  const userId = await getCurrentUserId();

  const existing = await prisma.collectionCard.findFirst({
    where: { id: cardId, userId },
  });

  if (!existing) {
    throw new Error("Card not found in collection");
  }

  if (quantity <= 0) {
    await prisma.collectionCard.delete({
      where: { id: cardId },
    });
    revalidatePath("/collection");
    revalidatePath("/decks");
    return null;
  }

  const updated = await prisma.collectionCard.update({
    where: { id: cardId },
    data: { quantity },
  });

  revalidatePath("/collection");
  revalidatePath("/decks");
  return updated;
}

export async function deleteCollectionCard(cardId: string) {
  const userId = await getCurrentUserId();

  await prisma.collectionCard.deleteMany({
    where: { id: cardId, userId },
  });

  revalidatePath("/collection");
  revalidatePath("/decks");
}
