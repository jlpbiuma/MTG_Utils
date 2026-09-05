"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "./auth";
import { normalizeCardName, processPendingCardsWorker } from "@/lib/worker";

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
 * Performs instant bulk insertion with local cache lookup and schedules background
 * Scryfall enrichment for any uncached cards (0 delay for user, 0 chance of HTTP 429).
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

  // Deduplicate and aggregate lines by card name and sideboard
  const aggregatedMap = new Map<string, ParsedCardLine>();
  for (const line of parsedLines) {
    const key = `${line.name.toLowerCase().trim()}_${line.isSideboard}`;
    if (aggregatedMap.has(key)) {
      aggregatedMap.get(key)!.quantity += line.quantity;
    } else {
      aggregatedMap.set(key, { ...line });
    }
  }

  const distinctCards = Array.from(aggregatedMap.values());

  // 1. Check local CardCatalog cache for instant zero-latency resolution
  const normalizedNames = distinctCards.map((c) => normalizeCardName(c.name));
  const cachedCatalog = await prisma.cardCatalog.findMany({
    where: { normalizedName: { in: normalizedNames } },
  });
  const catalogMap = new Map(cachedCatalog.map((c) => [c.normalizedName, c]));

  // 2. Create Deck
  const deck = await prisma.deck.create({
    data: {
      userId,
      name: deckName,
      format,
      description: params.description?.trim() || "Importado desde texto / Moxfield",
    },
  });

  // 3. Prepare deck cards
  let hasPendingCards = false;
  const deckCardsData = distinctCards.map((c) => {
    const norm = normalizeCardName(c.name);
    const cached = catalogMap.get(norm);

    if (!cached) {
      hasPendingCards = true;
    }

    return {
      deckId: deck.id,
      cardScryfallId: cached ? cached.id : `pending:${norm}`,
      cardName: cached ? cached.name : c.name,
      quantity: c.quantity,
      isSideboard: c.isSideboard,
      manaCost: cached?.manaCost || null,
      typeLine: cached?.typeLine || null,
      imageUri: cached?.imageUri || null,
    };
  });

  // 4. Bulk insert all cards in a single database query
  if (deckCardsData.length > 0) {
    await prisma.deckCard.createMany({
      data: deckCardsData,
    });
  }

  // 5. If any card was not in cache, schedule background worker
  if (hasPendingCards) {
    after(async () => {
      try {
        await processPendingCardsWorker({ delayMs: 100, batchSize: 75 });
      } catch (err) {
        console.error("Background worker failed for deck import:", err);
      }
    });
  }

  revalidatePath("/decks");
  revalidatePath(`/decks/${deck.id}`);

  const totalCards = distinctCards.reduce((s, c) => s + c.quantity, 0);
  return {
    deckId: deck.id,
    totalCards,
    uniqueCards: distinctCards.length,
  };
}

/**
 * Server Action to import user collection from raw text.
 * Performs instant bulk insertion with local cache lookup and schedules background
 * Scryfall enrichment for any uncached cards.
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

  let totalCardsCount = 0;

  // Aggregate input lines by normalized card name
  const aggregatedCards = new Map<
    string,
    {
      cardName: string;
      quantity: number;
      setCode?: string | null;
      collectorNumber?: string | null;
    }
  >();

  for (const line of parsedLines) {
    totalCardsCount += line.quantity;
    const norm = normalizeCardName(line.name);

    const existingAgg = aggregatedCards.get(norm);
    if (existingAgg) {
      existingAgg.quantity += line.quantity;
    } else {
      aggregatedCards.set(norm, {
        cardName: line.name,
        quantity: line.quantity,
        setCode: line.set || null,
        collectorNumber: line.collectorNumber || null,
      });
    }
  }

  // 1. Check local CardCatalog cache
  const normalizedNames = Array.from(aggregatedCards.keys());
  const cachedCatalog = await prisma.cardCatalog.findMany({
    where: { normalizedName: { in: normalizedNames } },
  });
  const catalogMap = new Map(cachedCatalog.map((c) => [c.normalizedName, c]));

  // 2. Fetch user's existing collection cards
  const candidateIds = normalizedNames.flatMap((norm) => {
    const cached = catalogMap.get(norm);
    return cached ? [cached.id, `pending:${norm}`] : [`pending:${norm}`];
  });

  const existingRecords = await prisma.collectionCard.findMany({
    where: {
      userId,
      cardScryfallId: { in: candidateIds },
    },
  });

  const existingMap = new Map(existingRecords.map((r) => [r.cardScryfallId, r]));

  const toCreate: Array<{
    userId: string;
    cardScryfallId: string;
    cardName: string;
    quantity: number;
    setCode?: string | null;
    collectorNumber?: string | null;
    manaCost?: string | null;
    typeLine?: string | null;
    imageUri?: string | null;
  }> = [];

  const toUpdate: Array<{
    id: string;
    quantity: number;
    imageUri?: string | null;
  }> = [];

  let hasPendingCards = false;

  for (const [norm, item] of aggregatedCards.entries()) {
    const cached = catalogMap.get(norm);
    const targetId = cached ? cached.id : `pending:${norm}`;

    if (!cached) {
      hasPendingCards = true;
    }

    const existing = existingMap.get(targetId) || existingMap.get(`pending:${norm}`);

    if (existing) {
      toUpdate.push({
        id: existing.id,
        quantity: existing.quantity + item.quantity,
        imageUri: cached?.imageUri || existing.imageUri,
      });
    } else {
      toCreate.push({
        userId,
        cardScryfallId: targetId,
        cardName: cached ? cached.name : item.cardName,
        quantity: item.quantity,
        setCode: item.setCode || cached?.setCode || null,
        collectorNumber: item.collectorNumber || cached?.collectorNumber || null,
        manaCost: cached?.manaCost || null,
        typeLine: cached?.typeLine || null,
        imageUri: cached?.imageUri || null,
      });
    }
  }

  // 3. Bulk insert all new cards in a single query
  if (toCreate.length > 0) {
    await prisma.collectionCard.createMany({
      data: toCreate,
    });
  }

  // 4. Batch update existing cards in parallel transactions of 50
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

  // 5. Schedule background worker if any card lacks image/metadata
  if (hasPendingCards) {
    after(async () => {
      try {
        await processPendingCardsWorker({ delayMs: 100, batchSize: 75 });
      } catch (err) {
        console.error("Background worker failed for collection import:", err);
      }
    });
  }

  revalidatePath("/collection");
  revalidatePath("/decks");

  return {
    totalImported: totalCardsCount,
    uniqueImported: aggregatedCards.size,
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
