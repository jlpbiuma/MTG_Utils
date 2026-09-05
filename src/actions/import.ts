"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "./auth";

import { parseDecklistText, type ParsedCardLine } from "@/lib/parser";

export type { ParsedCardLine };

export interface ResolvedCardData {
  scryfallId: string;
  name: string;
  manaCost: string | null;
  typeLine: string | null;
  imageUri: string | null;
  set: string | null;
  collectorNumber: string | null;
}

const SCRYFALL_COLLECTION_URL = "https://api.scryfall.com/cards/collection";
const SCRYFALL_HEADERS = {
  "User-Agent": "MTGUtils/1.0 (fullstack-nextjs-import)",
  Accept: "application/json;q=0.9,*/*;q=0.8",
  "Content-Type": "application/json",
};

/**
 * Resolves a list of card names in bulk using Scryfall POST /cards/collection endpoint.
 * Processes in chunks of up to 75 identifiers for maximum speed and API compliance.
 */
export async function resolveCardsInBulk(
  cards: ParsedCardLine[]
): Promise<Map<string, ResolvedCardData>> {
  const resolvedMap = new Map<string, ResolvedCardData>();
  if (cards.length === 0) return resolvedMap;

  // Deduplicate identifiers for Scryfall
  const uniqueNames = Array.from(new Set(cards.map((c) => c.name.toLowerCase().trim())));

  // Chunk into batches of 75
  const CHUNK_SIZE = 75;
  const chunks: Array<Array<{ name: string }>> = [];

  for (let i = 0; i < uniqueNames.length; i += CHUNK_SIZE) {
    const chunk = uniqueNames.slice(i, i + CHUNK_SIZE).map((name) => ({ name }));
    chunks.push(chunk);
  }

  // Execute chunk queries
  await Promise.all(
    chunks.map(async (identifiers) => {
      try {
        const res = await fetch(SCRYFALL_COLLECTION_URL, {
          method: "POST",
          headers: SCRYFALL_HEADERS,
          body: JSON.stringify({ identifiers }),
        });

        if (!res.ok) {
          console.warn("Scryfall collection endpoint error:", res.status);
          return;
        }

        const json = await res.json();
        const scryfallList: any[] = json.data || [];

        for (const item of scryfallList) {
          const key = item.name.toLowerCase().trim();
          const imgUri =
            item.image_uris?.normal ||
            item.card_faces?.[0]?.image_uris?.normal ||
            item.image_uris?.small ||
            null;

          const cardData: ResolvedCardData = {
            scryfallId: item.id,
            name: item.name,
            manaCost: item.mana_cost || item.card_faces?.[0]?.mana_cost || null,
            typeLine: item.type_line || item.card_faces?.[0]?.type_line || null,
            imageUri: imgUri,
            set: item.set || null,
            collectorNumber: item.collector_number || null,
          };

          resolvedMap.set(key, cardData);
        }
      } catch (err) {
        console.error("Error querying Scryfall bulk collection:", err);
      }
    })
  );

  return resolvedMap;
}

/**
 * Server Action to import a complete deck from raw text.
 */
export async function importDeckFromText(params: {
  name: string;
  format?: string;
  description?: string;
  rawText: string;
}): Promise<{ deckId: string; totalCards: number; uniqueCards: number }> {
  const userId = await getCurrentUserId();
  const deckName = params.name.trim() || "Mazo Importado";
  const format = params.format || "Commander / EDH";

  const parsedLines = parseDecklistText(params.rawText);
  if (parsedLines.length === 0) {
    throw new Error("No se encontraron cartas válidas en el texto proporcionado.");
  }

  // Resolve card information in bulk from Scryfall
  const resolvedMap = await resolveCardsInBulk(parsedLines);

  // Create deck in Prisma
  const deck = await prisma.deck.create({
    data: {
      userId,
      name: deckName,
      format,
      description: params.description?.trim() || "Importado desde texto / Moxfield",
    },
  });

  // Prepare deck cards data
  const deckCardsData = parsedLines.map((c) => {
    const resolved = resolvedMap.get(c.name.toLowerCase().trim());

    return {
      deckId: deck.id,
      cardScryfallId: resolved ? resolved.scryfallId : `custom-${c.name.toLowerCase().replace(/\s+/g, "-")}`,
      cardName: resolved ? resolved.name : c.name,
      quantity: c.quantity,
      isSideboard: c.isSideboard,
      manaCost: resolved?.manaCost || null,
      typeLine: resolved?.typeLine || null,
      imageUri: resolved?.imageUri || null,
    };
  });

  // Deduplicate deckId + cardScryfallId + isSideboard in case input had duplicates
  const aggregatedCards = new Map<string, typeof deckCardsData[0]>();
  for (const card of deckCardsData) {
    const key = `${card.cardScryfallId}_${card.isSideboard}`;
    if (aggregatedCards.has(key)) {
      aggregatedCards.get(key)!.quantity += card.quantity;
    } else {
      aggregatedCards.set(key, { ...card });
    }
  }

  // Insert cards in a single bulk operation
  const cardsToInsert = Array.from(aggregatedCards.values());
  if (cardsToInsert.length > 0) {
    await prisma.deckCard.createMany({
      data: cardsToInsert,
    });
  }

  revalidatePath("/decks");
  revalidatePath(`/decks/${deck.id}`);

  const totalCards = parsedLines.reduce((s, c) => s + c.quantity, 0);
  return {
    deckId: deck.id,
    totalCards,
    uniqueCards: aggregatedCards.size,
  };
}

/**
 * Server Action to import user collection from raw text.
 */
export async function importCollectionFromText(rawText: string): Promise<{
  totalImported: number;
  uniqueImported: number;
}> {
  const userId = await getCurrentUserId();
  const parsedLines = parseDecklistText(rawText);

  if (parsedLines.length === 0) {
    throw new Error("No se detectaron cartas para importar.");
  }

  const resolvedMap = await resolveCardsInBulk(parsedLines);

  let totalCardsCount = 0;

  // Aggregate input lines by card identifier
  const aggregatedCards = new Map<
    string,
    {
      cardName: string;
      quantity: number;
      setCode?: string | null;
      collectorNumber?: string | null;
      manaCost?: string | null;
      typeLine?: string | null;
      imageUri?: string | null;
    }
  >();

  for (const line of parsedLines) {
    totalCardsCount += line.quantity;
    const resolved = resolvedMap.get(line.name.toLowerCase().trim());
    const scryfallId = resolved ? resolved.scryfallId : `custom-${line.name.toLowerCase().replace(/\s+/g, "-")}`;
    const cardName = resolved ? resolved.name : line.name;

    const existingAgg = aggregatedCards.get(scryfallId);
    if (existingAgg) {
      existingAgg.quantity += line.quantity;
    } else {
      aggregatedCards.set(scryfallId, {
        cardName,
        quantity: line.quantity,
        setCode: line.set || resolved?.set || null,
        collectorNumber: line.collectorNumber || resolved?.collectorNumber || null,
        manaCost: resolved?.manaCost || null,
        typeLine: resolved?.typeLine || null,
        imageUri: resolved?.imageUri || null,
      });
    }
  }

  const cardIds = Array.from(aggregatedCards.keys());
  const existingRecords = await prisma.collectionCard.findMany({
    where: {
      userId,
      cardScryfallId: { in: cardIds },
    },
  });

  const existingMap = new Map(existingRecords.map((r) => [r.cardScryfallId, r]));

  const toCreate: {
    userId: string;
    cardScryfallId: string;
    cardName: string;
    quantity: number;
    setCode?: string | null;
    collectorNumber?: string | null;
    manaCost?: string | null;
    typeLine?: string | null;
    imageUri?: string | null;
  }[] = [];

  const toUpdate: {
    id: string;
    quantity: number;
    imageUri?: string | null;
  }[] = [];

  for (const [scryfallId, item] of aggregatedCards.entries()) {
    const existing = existingMap.get(scryfallId);
    if (existing) {
      toUpdate.push({
        id: existing.id,
        quantity: existing.quantity + item.quantity,
        imageUri: item.imageUri || existing.imageUri,
      });
    } else {
      toCreate.push({
        userId,
        cardScryfallId: scryfallId,
        cardName: item.cardName,
        quantity: item.quantity,
        setCode: item.setCode,
        collectorNumber: item.collectorNumber,
        manaCost: item.manaCost,
        typeLine: item.typeLine,
        imageUri: item.imageUri,
      });
    }
  }

  // Bulk insert all new cards in a single query
  if (toCreate.length > 0) {
    await prisma.collectionCard.createMany({
      data: toCreate,
    });
  }

  // Batch update existing cards in parallel transactions of 50
  if (toUpdate.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < toUpdate.length; i += batchSize) {
      const chunk = toUpdate.slice(i, i + batchSize);
      await prisma.$transaction(
        chunk.map((c) =>
          prisma.collectionCard.update({
            where: { id: c.id },
            data: {
              quantity: c.quantity,
              imageUri: c.imageUri,
            },
          })
        )
      );
    }
  }

  revalidatePath("/collection");
  revalidatePath("/decks");

  return {
    totalImported: totalCardsCount,
    uniqueImported: parsedLines.length,
  };
}

/**
 * Attempts to import from a Moxfield public deck URL.
 * If Cloudflare Turnstile blocks the request, returns a graceful error code.
 */
export async function importDeckFromMoxfieldUrl(moxfieldUrl: string): Promise<{
  success?: boolean;
  deckId?: string;
  error?: "CLOUDFLARE_BLOCKED" | "INVALID_URL" | "NOT_FOUND" | "FETCH_ERROR";
  message?: string;
}> {
  // Extract Moxfield deck ID from URL (e.g. https://www.moxfield.com/decks/k0kUqT2tKUqjZ549Xh0O0A)
  const match = moxfieldUrl.trim().match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i);
  if (!match) {
    return {
      error: "INVALID_URL",
      message: "La URL proporcionada no parece ser un enlace válido de un mazo de Moxfield (ej: https://www.moxfield.com/decks/id)",
    };
  }

  const moxfieldId = match[1];

  try {
    const res = await fetch(`https://api2.moxfield.com/v2/decks/all/${moxfieldId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    });

    const contentType = res.headers.get("content-type") || "";

    // If Cloudflare returns HTML challenge instead of JSON
    if (res.status === 403 || (!contentType.includes("json") && (await res.text()).includes("Cloudflare"))) {
      return {
        error: "CLOUDFLARE_BLOCKED",
        message: "Moxfield protege sus enlaces contra peticiones directas mediante Cloudflare.",
      };
    }

    if (res.status === 404) {
      return {
        error: "NOT_FOUND",
        message: "El mazo no fue encontrado en Moxfield. Asegúrate de que sea un mazo público.",
      };
    }

    if (!res.ok) {
      return {
        error: "FETCH_ERROR",
        message: `Moxfield respondió con código ${res.status}`,
      };
    }

    const data = await res.json();
    const deckName = data.name || "Mazo de Moxfield";
    const format = data.format || "Commander / EDH";

    // Build raw text from Moxfield JSON representation
    const textLines: string[] = [];

    // Mainboard & Commanders
    if (data.commanders) {
      for (const [name, cardInfo] of Object.entries(data.commanders as Record<string, any>)) {
        textLines.push(`${cardInfo.quantity || 1} ${name}`);
      }
    }
    if (data.mainboard) {
      for (const [name, cardInfo] of Object.entries(data.mainboard as Record<string, any>)) {
        textLines.push(`${cardInfo.quantity || 1} ${name}`);
      }
    }

    // Sideboard
    if (data.sideboard && Object.keys(data.sideboard).length > 0) {
      textLines.push("\n// Sideboard");
      for (const [name, cardInfo] of Object.entries(data.sideboard as Record<string, any>)) {
        textLines.push(`${cardInfo.quantity || 1} ${name}`);
      }
    }

    const imported = await importDeckFromText({
      name: deckName,
      format,
      description: `Importado directamente desde Moxfield (${moxfieldUrl})`,
      rawText: textLines.join("\n"),
    });

    return { success: true, deckId: imported.deckId };
  } catch (err: unknown) {
    return {
      error: "CLOUDFLARE_BLOCKED",
      message: "No fue posible conectar con el servidor de Moxfield debido a restricciones de Cloudflare.",
    };
  }
}
