"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "./auth";

export interface ParsedCardLine {
  quantity: number;
  name: string;
  set?: string;
  collectorNumber?: string;
  isSideboard: boolean;
}

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
 * Parses decklists in standard MTG formats:
 * - Moxfield export format: `1 Atraxa, Praetors' Voice (2XM) 198 *F*`
 * - MTG Arena format: `Deck`, `4 Lightning Bolt (CLB) 123`, `Sideboard`, `1 Force of Will`
 * - Plaintext format: `4x Lightning Bolt`, `1 Sol Ring`
 * - Sideboard lines: `SB: 1 Card` or under `// Sideboard`, `Sideboard:`, etc.
 */
export function parseDecklistText(rawText: string): ParsedCardLine[] {
  const lines = rawText.split(/\r?\n/);
  const parsedCards: ParsedCardLine[] = [];
  let inSideboard = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Check for section headers
    const lower = line.toLowerCase();
    if (
      lower.startsWith("// sideboard") ||
      lower.startsWith("sideboard") ||
      lower.startsWith("//sideboard") ||
      lower === "sideboard:"
    ) {
      inSideboard = true;
      continue;
    }

    if (
      lower.startsWith("// main") ||
      lower.startsWith("deck") ||
      lower.startsWith("// deck") ||
      lower.startsWith("// commander") ||
      lower.startsWith("commander")
    ) {
      inSideboard = false;
      continue;
    }

    // Ignore other commentary lines starting with // or #
    if (line.startsWith("//") || line.startsWith("#")) {
      continue;
    }

    let isSideboardCard = inSideboard;
    let cardText = line;

    // Check for "SB: 1 Card Name" format
    if (/^sb:\s*/i.test(cardText)) {
      isSideboardCard = true;
      cardText = cardText.replace(/^sb:\s*/i, "").trim();
    }

    // Extract quantity (e.g. "4 ", "4x ", "1 ", or default 1)
    let quantity = 1;
    const qtyMatch = cardText.match(/^(\d+)(?:x|\s)\s*(.*)$/i);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10) || 1;
      cardText = qtyMatch[2].trim();
    }

    // Clean up trailing tags like *F*, *E*, *Foil*, etc.
    cardText = cardText.replace(/\s*\*[A-Za-z0-9]+\*\s*$/g, "").trim();

    // Extract set code and collector number if present, e.g. "(2XM) 198" or "(CLB) 12"
    let set: string | undefined;
    let collectorNumber: string | undefined;

    const setMatch = cardText.match(/\(([A-Za-z0-9_]{3,6})\)\s*([A-Za-z0-9\-]+)?$/i);
    if (setMatch) {
      set = setMatch[1].toLowerCase();
      collectorNumber = setMatch[2]?.trim();
      cardText = cardText.replace(/\(([A-Za-z0-9_]{3,6})\)\s*([A-Za-z0-9\-]+)?$/i, "").trim();
    }

    // Fallback: [SET:123] format
    const altSetMatch = cardText.match(/\[([A-Za-z0-9_]{3,6}):([A-Za-z0-9\-]+)\]$/i);
    if (altSetMatch) {
      set = altSetMatch[1].toLowerCase();
      collectorNumber = altSetMatch[2]?.trim();
      cardText = cardText.replace(/\[([A-Za-z0-9_]{3,6}):([A-Za-z0-9\-]+)\]$/i, "").trim();
    }

    if (cardText.length > 0) {
      parsedCards.push({
        quantity,
        name: cardText,
        set,
        collectorNumber,
        isSideboard: isSideboardCard,
      });
    }
  }

  return parsedCards;
}

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

  // Insert cards into database
  for (const card of Array.from(aggregatedCards.values())) {
    await prisma.deckCard.create({ data: card });
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

  for (const line of parsedLines) {
    totalCardsCount += line.quantity;
    const resolved = resolvedMap.get(line.name.toLowerCase().trim());
    const scryfallId = resolved ? resolved.scryfallId : `custom-${line.name.toLowerCase().replace(/\s+/g, "-")}`;
    const cardName = resolved ? resolved.name : line.name;

    const existing = await prisma.collectionCard.findUnique({
      where: {
        userId_cardScryfallId: {
          userId,
          cardScryfallId: scryfallId,
        },
      },
    });

    if (existing) {
      await prisma.collectionCard.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + line.quantity,
          imageUri: resolved?.imageUri || existing.imageUri,
        },
      });
    } else {
      await prisma.collectionCard.create({
        data: {
          userId,
          cardScryfallId: scryfallId,
          cardName,
          quantity: line.quantity,
          setCode: line.set || resolved?.set || null,
          collectorNumber: line.collectorNumber || resolved?.collectorNumber || null,
          manaCost: resolved?.manaCost || null,
          typeLine: resolved?.typeLine || null,
          imageUri: resolved?.imageUri || null,
        },
      });
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
