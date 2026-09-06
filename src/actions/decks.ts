"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "./auth";
import { normalizeCardName } from "@/lib/card-utils";
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
    const norm = normalizeCardName(item.cardName);
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
        const norm = normalizeCardName(c.cardName);
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
        commander: deck.commander,
        commanderScryfallId: deck.commanderScryfallId,
        commanderImageUri: deck.commanderImageUri,
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

  // 0. Auto-enrich any deck cards missing typeLine or pending Scryfall enrichment
  const cardsNeedingEnrichment = deck.cards.filter(
    (c) => !c.typeLine || c.cardScryfallId.startsWith("pending:")
  );

  if (cardsNeedingEnrichment.length > 0) {
    try {
      // Step A: Check CardCatalog for cached metadata
      const normNames = Array.from(
        new Set(cardsNeedingEnrichment.map((c) => normalizeCardName(c.cardName)))
      );
      const catalogRecords = await prisma.cardCatalog.findMany({
        where: { normalizedName: { in: normNames } },
      });
      const catalogMap = new Map(catalogRecords.map((r) => [r.normalizedName, r]));

      const stillMissingNames: string[] = [];

      for (const dc of cardsNeedingEnrichment) {
        const norm = normalizeCardName(dc.cardName);
        const cached = catalogMap.get(norm);
        if (cached && cached.typeLine) {
          dc.typeLine = cached.typeLine;
          dc.manaCost = dc.manaCost || cached.manaCost;
          dc.imageUri = dc.imageUri || cached.imageUri;
          if (dc.cardScryfallId.startsWith("pending:") && cached.id) {
            dc.cardScryfallId = cached.id;
          }
          await prisma.deckCard.update({
            where: { id: dc.id },
            data: {
              typeLine: cached.typeLine,
              manaCost: dc.manaCost,
              imageUri: dc.imageUri,
              cardScryfallId: dc.cardScryfallId,
            },
          }).catch(() => {});
        } else {
          stillMissingNames.push(dc.cardName);
        }
      }

      // Step B: If any are still missing, fetch in bulk from Scryfall
      if (stillMissingNames.length > 0) {
        const uniqueNames = Array.from(new Set(stillMissingNames));
        for (let i = 0; i < uniqueNames.length; i += 75) {
          const batch = uniqueNames.slice(i, i + 75);
          const scryfallRes = await fetch("https://api.scryfall.com/cards/collection", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "MTGUtils/1.0",
              Accept: "application/json",
            },
            body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
          });

          if (scryfallRes.ok) {
            const scryfallData = await scryfallRes.json();
            const foundCards: any[] = scryfallData.data || [];

            for (const card of foundCards) {
              const imageUri =
                card.image_uris?.normal ||
                card.image_uris?.small ||
                card.card_faces?.[0]?.image_uris?.normal ||
                null;
              const manaCost = card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? null;
              const typeLine = card.type_line ?? card.card_faces?.[0]?.type_line ?? null;
              const norm = normalizeCardName(card.name);

              await prisma.cardCatalog.upsert({
                where: { normalizedName: norm },
                update: {
                  imageUri,
                  manaCost,
                  typeLine,
                  setCode: card.set ?? null,
                  collectorNumber: card.collector_number ?? null,
                },
                create: {
                  id: card.id,
                  name: card.name,
                  normalizedName: norm,
                  imageUri,
                  manaCost,
                  typeLine,
                  setCode: card.set ?? null,
                  collectorNumber: card.collector_number ?? null,
                },
              }).catch(() => {});

              for (const dc of deck.cards) {
                if (normalizeCardName(dc.cardName) === norm) {
                  dc.typeLine = typeLine;
                  dc.manaCost = manaCost;
                  dc.imageUri = imageUri;
                  dc.cardScryfallId = card.id;

                  await prisma.deckCard.update({
                    where: { id: dc.id },
                    data: {
                      typeLine,
                      manaCost,
                      imageUri,
                      cardScryfallId: card.id,
                    },
                  }).catch(() => {});
                }
              }
            }
          }
        }
      }
    } catch (enrichErr) {
      console.warn("Could not enrich deck cards in getDeckDetail:", enrichErr);
    }
  }

  // 1. Fetch assigned_quantity for all cards in this deck directly from SQL (immune to in-memory DMMF caching)
  let thisDeckAssignments: Map<string, number> = new Map();
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; assignedQuantity: any }>>`
      SELECT id, COALESCE(assigned_quantity, 0) as "assignedQuantity" 
      FROM deck_cards 
      WHERE deck_id = ${deckId}
    `;
    thisDeckAssignments = new Map(rows.map((r) => [r.id, Number(r.assignedQuantity || 0)]));
  } catch (rawErr) {
    console.warn("Could not query assigned_quantity directly:", rawErr);
  }

  // 2. Fetch cross-deck assignments for all cards assigned to other decks of this user
  let allAssignedDeckCards: Array<{
    id: string;
    cardScryfallId: string;
    cardName: string;
    assignedQuantity: number;
    deckId: string;
    deck: { id: string; name: string };
  }> = [];

  try {
    const assignedRows = await prisma.$queryRaw<
      Array<{
        id: string;
        cardScryfallId: string;
        cardName: string;
        assignedQuantity: any;
        deckId: string;
        deckName: string;
      }>
    >`
      SELECT 
        dc.id, 
        dc.deck_id as "deckId", 
        dc.card_scryfall_id as "cardScryfallId", 
        dc.card_name as "cardName", 
        COALESCE(dc.assigned_quantity, 0) as "assignedQuantity", 
        d.id as "targetDeckId", 
        d.name as "deckName"
      FROM deck_cards dc
      JOIN decks d ON dc.deck_id = d.id
      WHERE d.user_id = ${userId} AND COALESCE(dc.assigned_quantity, 0) > 0
    `;

    allAssignedDeckCards = assignedRows.map((r) => ({
      id: r.id,
      cardScryfallId: r.cardScryfallId,
      cardName: r.cardName,
      assignedQuantity: Number(r.assignedQuantity || 0),
      deckId: r.deckId,
      deck: { id: r.deckId, name: r.deckName },
    }));
  } catch (err) {
    console.warn("Could not load cross-deck card assignments via raw query:", err);
  }

  // Build lookup of assignments across all decks
  // key: normalizedName or scryfallId -> array of { deckId, deckName, quantity, cardId }
  const assignmentsByCard = new Map<
    string,
    Array<{ deckId: string; deckName: string; quantity: number; cardId: string }>
  >();


  for (const ac of allAssignedDeckCards) {
    const norm = normalizeCardName(ac.cardName);
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
    const norm = normalizeCardName(c.cardName);
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

    const isCommander =
      c.isCommander ||
      (deck.commander ? normalizeCardName(c.cardName) === normalizeCardName(deck.commander) : false);

    return {
      id: c.id,
      deckId: c.deckId,
      cardScryfallId: c.cardScryfallId,
      cardName: c.cardName,
      quantity: c.quantity,
      assignedQuantity: thisDeckAssignments.get(c.id) ?? (c as any).assignedQuantity ?? 0,
      isSideboard: c.isSideboard,
      isCommander,
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
    commander: deck.commander,
    commanderScryfallId: deck.commanderScryfallId,
    commanderImageUri: deck.commanderImageUri,
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

  let deck: any;
  try {
    deck = await prisma.deck.create({
      data: {
        userId,
        name: validated.name,
        format: validated.format,
        description: validated.description,
        commander: validated.commander,
        commanderScryfallId: validated.commanderScryfallId,
        commanderImageUri: validated.commanderImageUri,
      },
    });
  } catch (err) {
    console.warn("Prisma create failed in createDeck, using SQL fallback:", err);
    const newId = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "public"."decks" ("id", "user_id", "name", "format", "description", "commander", "commander_scryfall_id", "commander_image_uri", "created_at", "updated_at")
      VALUES (${newId}, ${userId}, ${validated.name}, ${validated.format}, ${validated.description ?? null}, ${validated.commander ?? null}, ${validated.commanderScryfallId ?? null}, ${validated.commanderImageUri ?? null}, NOW(), NOW())
    `;
    deck = { id: newId, userId, ...validated };
  }

  // If commander was provided, ensure it's in the deck as a card
  if (validated.commander && deck?.id) {
    try {
      await addCardToDeck(deck.id, {
        cardScryfallId: validated.commanderScryfallId || `cmd:${normalizeCardName(validated.commander)}`,
        cardName: validated.commander,
        quantity: 1,
        isSideboard: false,
        isCommander: true,
        imageUri: validated.commanderImageUri,
      });
    } catch (cmdErr) {
      console.warn("Could not auto-add commander card to deck cards:", cmdErr);
    }
  }

  revalidatePath("/decks");
  return deck;
}

export async function updateDeck(deckId: string, input: DeckUpdateInput) {
  const userId = await getCurrentUserId();
  const validated = DeckUpdateSchema.parse(input);

  try {
    const deck = await prisma.deck.updateMany({
      where: { id: deckId, userId },
      data: validated,
    });
    revalidatePath("/decks");
    revalidatePath(`/decks/${deckId}`);
    return deck;
  } catch (err) {
    console.warn("Prisma updateMany failed in updateDeck, using SQL fallback:", err);
    await prisma.$executeRaw`
      UPDATE "public"."decks"
      SET "name" = COALESCE(${validated.name ?? null}, "name"),
          "format" = COALESCE(${validated.format ?? null}, "format"),
          "description" = ${validated.description ?? null},
          "commander" = ${validated.commander ?? null},
          "commander_scryfall_id" = ${validated.commanderScryfallId ?? null},
          "commander_image_uri" = ${validated.commanderImageUri ?? null}
      WHERE "id" = ${deckId} AND "user_id" = ${userId}
    `;
    revalidatePath("/decks");
    revalidatePath(`/decks/${deckId}`);
    return { count: 1 };
  }
}

export async function deleteDeck(deckId: string) {
  const userId = await getCurrentUserId();

  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
  });

  if (!deck) throw new Error("Mazo no encontrado");

  await prisma.deck.delete({
    where: { id: deckId },
  });

  revalidatePath("/decks");
  return { success: true };
}

export async function setDeckCommander(
  deckId: string,
  commanderName: string,
  scryfallId?: string,
  imageUri?: string
) {
  const userId = await getCurrentUserId();

  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
    include: { cards: true },
  });

  if (!deck) throw new Error("Mazo no encontrado");

  const normCommander = normalizeCardName(commanderName);
  const matchingCard = deck.cards.find(
    (c) => normalizeCardName(c.cardName) === normCommander
  );

  const finalScryfallId = scryfallId || matchingCard?.cardScryfallId || null;
  const finalImageUri = imageUri || matchingCard?.imageUri || null;

  try {
    await prisma.deck.update({
      where: { id: deckId },
      data: {
        commander: commanderName,
        commanderScryfallId: finalScryfallId,
        commanderImageUri: finalImageUri,
      },
    });
  } catch (err) {
    console.warn("Prisma update failed in setDeckCommander, using SQL fallback:", err);
    await prisma.$executeRaw`
      UPDATE "public"."decks"
      SET "commander" = ${commanderName},
          "commander_scryfall_id" = ${finalScryfallId},
          "commander_image_uri" = ${finalImageUri}
      WHERE "id" = ${deckId}
    `;
  }

  // Update isCommander flags on deck cards
  await prisma.deckCard.updateMany({
    where: { deckId },
    data: { isCommander: false },
  }).catch(() => {});

  if (matchingCard) {
    await prisma.deckCard.update({
      where: { id: matchingCard.id },
      data: { isCommander: true },
    }).catch(() => {});
  } else {
    // If commander was not already in the deck, add it
    await addCardToDeck(deckId, {
      cardScryfallId: finalScryfallId || `cmd:${normCommander}`,
      cardName: commanderName,
      quantity: 1,
      isSideboard: false,
      isCommander: true,
      imageUri: finalImageUri,
    }).catch((addErr) => {
      console.warn("Could not auto-add commander to deck cards:", addErr);
    });
  }

  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}`);

  return {
    commander: commanderName,
    commanderScryfallId: finalScryfallId,
    commanderImageUri: finalImageUri,
  };
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

  // Check total assigned across all decks via direct SQL
  const totalAssignedResult = await prisma.$queryRaw<Array<{ total: any }>>`
    SELECT COALESCE(SUM(dc.assigned_quantity), 0) as "total"
    FROM deck_cards dc
    JOIN decks d ON dc.deck_id = d.id
    WHERE d.user_id = ${userId}
      AND (dc.card_scryfall_id = ${card.cardScryfallId} OR LOWER(dc.card_name) = LOWER(${card.cardName}))
  `;
  const totalAssigned = Number(totalAssignedResult[0]?.total || 0);
  const availableToAssign = Math.max(0, ownedInCollection - totalAssigned);

  if (availableToAssign <= 0) {
    throw new Error("No hay copias libres disponibles en tu colección física para asignar.");
  }

  // Get card's current assigned quantity directly
  const cardAssignedResult = await prisma.$queryRaw<Array<{ assignedQuantity: any }>>`
    SELECT COALESCE(assigned_quantity, 0) as "assignedQuantity"
    FROM deck_cards
    WHERE id = ${deckCardId}
  `;
  const currentAssigned = Number(cardAssignedResult[0]?.assignedQuantity || 0);

  const neededInDeck = Math.max(0, card.quantity - currentAssigned);
  const amountToAssign = Math.min(quantityToAssign, availableToAssign, neededInDeck);

  if (amountToAssign <= 0) {
    return { ...card, assignedQuantity: currentAssigned };
  }

  await prisma.$executeRaw`
    UPDATE deck_cards 
    SET assigned_quantity = COALESCE(assigned_quantity, 0) + ${amountToAssign} 
    WHERE id = ${deckCardId}
  `;

  revalidatePath("/decks");
  revalidatePath(`/decks/${card.deckId}`);
  return { ...card, assignedQuantity: currentAssigned + amountToAssign };
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

  const cardAssignedResult = await prisma.$queryRaw<Array<{ assignedQuantity: any }>>`
    SELECT COALESCE(assigned_quantity, 0) as "assignedQuantity"
    FROM deck_cards
    WHERE id = ${deckCardId}
  `;
  const currentAssigned = Number(cardAssignedResult[0]?.assignedQuantity || 0);

  const amountToUnassign = Math.min(quantityToUnassign, currentAssigned);
  if (amountToUnassign <= 0) return { ...card, assignedQuantity: currentAssigned };

  await prisma.$executeRaw`
    UPDATE deck_cards 
    SET assigned_quantity = GREATEST(0, COALESCE(assigned_quantity, 0) - ${amountToUnassign}) 
    WHERE id = ${deckCardId}
  `;

  revalidatePath("/decks");
  revalidatePath(`/decks/${card.deckId}`);
  return { ...card, assignedQuantity: Math.max(0, currentAssigned - amountToUnassign) };
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

  const toCard = await prisma.deckCard.findUnique({
    where: { id: toDeckCardId },
    include: { deck: true },
  });

  if (!toCard || toCard.deck.userId !== userId) {
    throw new Error("Mazo destino no encontrado.");
  }

  // Find assigned card in fromDeck directly
  const fromCards = await prisma.$queryRaw<Array<{ id: string; assignedQuantity: any }>>`
    SELECT dc.id, COALESCE(dc.assigned_quantity, 0) as "assignedQuantity"
    FROM deck_cards dc
    JOIN decks d ON dc.deck_id = d.id
    WHERE dc.deck_id = ${fromDeckId}
      AND d.user_id = ${userId}
      AND LOWER(dc.card_name) = LOWER(${cardName})
      AND COALESCE(dc.assigned_quantity, 0) > 0
    LIMIT 1
  `;
  const fromCard = fromCards[0];

  if (!fromCard) {
    throw new Error("No se encontró la carta asignada en el mazo origen.");
  }

  const toCardAssignedResult = await prisma.$queryRaw<Array<{ assignedQuantity: any }>>`
    SELECT COALESCE(assigned_quantity, 0) as "assignedQuantity"
    FROM deck_cards
    WHERE id = ${toDeckCardId}
  `;
  const toCardAssigned = Number(toCardAssignedResult[0]?.assignedQuantity || 0);
  const fromCardAssigned = Number(fromCard.assignedQuantity || 0);

  const actualTransfer = Math.min(
    quantityToTransfer,
    fromCardAssigned,
    Math.max(0, toCard.quantity - toCardAssigned)
  );

  if (actualTransfer <= 0) return;

  await prisma.$executeRaw`
    UPDATE deck_cards 
    SET assigned_quantity = GREATEST(0, COALESCE(assigned_quantity, 0) - ${actualTransfer}) 
    WHERE id = ${fromCard.id}
  `;
  await prisma.$executeRaw`
    UPDATE deck_cards 
    SET assigned_quantity = COALESCE(assigned_quantity, 0) + ${actualTransfer} 
    WHERE id = ${toCard.id}
  `;

  revalidatePath("/decks");
  revalidatePath(`/decks/${toCard.deckId}`);
  revalidatePath(`/decks/${fromDeckId}`);
}

