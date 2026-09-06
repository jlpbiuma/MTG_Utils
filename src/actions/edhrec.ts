"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "./auth";
import { normalizeCardName } from "@/lib/card-utils";
import { fetchEdhrecCommanderData, toEdhrecSlug } from "@/lib/edhrec";
import { EdhrecCardRecommendation } from "@/lib/schemas";
import { setDeckCommander } from "./decks";

export interface DeckRecommendationsResult {
  hasCommander: boolean;
  commander: {
    name: string;
    imageUri: string | null;
    scryfallId: string | null;
    numDecks?: number;
    colorIdentity?: string[];
  } | null;
  categories: string[];
  recommendations: EdhrecCardRecommendation[];
  error?: string;
}

/**
 * Fetches EDHREC recommendations for a deck's designated commander,
 * matching cards against deck cards and the user's collection purely by normalized card name.
 */
export async function getDeckRecommendations(
  deckId: string
): Promise<DeckRecommendationsResult> {
  try {
    const userId = await getCurrentUserId();

    const deck = await prisma.deck.findFirst({
      where: { id: deckId, userId },
      include: { cards: true },
    });

    if (!deck) {
      return {
        hasCommander: false,
        commander: null,
        categories: [],
        recommendations: [],
        error: "Mazo no encontrado",
      };
    }

    let commanderName = deck.commander;
    let commanderImageUri = deck.commanderImageUri;
    let commanderScryfallId = deck.commanderScryfallId;

    // If deck has no commander assigned yet, check if any card is marked as commander
    if (!commanderName) {
      const cmdCard = deck.cards.find((c) => c.isCommander);
      if (cmdCard) {
        commanderName = cmdCard.cardName;
        commanderImageUri = cmdCard.imageUri || null;
        commanderScryfallId = cmdCard.cardScryfallId || null;

        // Persist to deck record
        await prisma.deck.update({
          where: { id: deckId },
          data: {
            commander: commanderName,
            commanderImageUri,
            commanderScryfallId,
          },
        }).catch(() => {});
      }
    }

    if (!commanderName) {
      return {
        hasCommander: false,
        commander: null,
        categories: [],
        recommendations: [],
      };
    }

    // Parallel fetch: EDHREC data and user collection
    const [edhrecData, userCollection] = await Promise.all([
      fetchEdhrecCommanderData(commanderName),
      prisma.collectionCard.findMany({
        where: { userId },
        select: { cardName: true, quantity: true },
      }),
    ]);

    if (!edhrecData) {
      return {
        hasCommander: true,
        commander: {
          name: commanderName,
          imageUri: commanderImageUri,
          scryfallId: commanderScryfallId,
        },
        categories: [],
        recommendations: [],
        error: `No se encontraron recomendaciones en EDHREC para '${commanderName}'. Asegúrate de que el nombre del comandante sea el nombre oficial en inglés.`,
      };
    }

    // Backfill commander image/id if missing
    if ((!commanderImageUri || !commanderScryfallId) && edhrecData.commander) {
      const updatedImg = commanderImageUri || edhrecData.commander.imageUri;
      const updatedId = commanderScryfallId || edhrecData.commander.id;
      if (updatedImg || updatedId) {
        await prisma.deck.update({
          where: { id: deckId },
          data: {
            commanderImageUri: updatedImg,
            commanderScryfallId: updatedId,
          },
        }).catch(() => {});
        commanderImageUri = updatedImg;
        commanderScryfallId = updatedId;
      }
    }

    // Build fast lookup for deck cards by normalized name
    const deckCardsSet = new Set<string>();
    for (const dc of deck.cards) {
      deckCardsSet.add(normalizeCardName(dc.cardName));
    }

    // Build fast lookup for collection by normalized name (requirement: pure name matching)
    const collectionMap = new Map<string, number>();
    for (const col of userCollection) {
      const norm = normalizeCardName(col.cardName);
      collectionMap.set(norm, (collectionMap.get(norm) || 0) + col.quantity);
    }

    // Map recommendations with deck & collection ownership status
    const recommendations: EdhrecCardRecommendation[] = edhrecData.cards.map((card) => {
      const norm = card.normalizedName;
      const isInDeck = deckCardsSet.has(norm);
      const collectionQuantity = collectionMap.get(norm) || 0;
      const isInCollection = collectionQuantity > 0;

      return {
        id: card.id,
        name: card.name,
        normalizedName: norm,
        sanitized: card.sanitized,
        category: card.category,
        numDecks: card.numDecks,
        potentialDecks: card.potentialDecks,
        inclusionPct: card.inclusionPct,
        synergy: card.synergy,
        imageUri: card.imageUri,
        isInDeck,
        isInCollection,
        collectionQuantity,
      };
    });

    // Default sorting: % inclusion descending
    recommendations.sort((a, b) => b.inclusionPct - a.inclusionPct);

    return {
      hasCommander: true,
      commander: {
        name: commanderName,
        imageUri: commanderImageUri || edhrecData.commander?.imageUri || null,
        scryfallId: commanderScryfallId || edhrecData.commander?.id || null,
        numDecks: edhrecData.commander?.numDecks,
        colorIdentity: edhrecData.commander?.colorIdentity,
      },
      categories: edhrecData.categories,
      recommendations,
    };
  } catch (error) {
    console.error("[EDHREC] Error in getDeckRecommendations:", error);
    return {
      hasCommander: false,
      commander: null,
      categories: [],
      recommendations: [],
      error: error instanceof Error ? error.message : "Error inesperado al cargar recomendaciones",
    };
  }
}
