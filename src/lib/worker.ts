import { prisma } from "@/lib/prisma";
import { normalizeCardName } from "@/lib/card-utils";

export { normalizeCardName };

const SCRYFALL_COLLECTION_URL = "https://api.scryfall.com/cards/collection";
const SCRYFALL_HEADERS = {
  "User-Agent": "MTGUtils/1.0 (worker-enrichment-pipeline)",
  Accept: "application/json;q=0.9,*/*;q=0.8",
  "Content-Type": "application/json",
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));



export interface WorkerEnrichmentResult {
  totalPending: number;
  resolvedFromCache: number;
  resolvedFromScryfall: number;
  notFoundCount: number;
  errorsCount: number;
}

/**
 * Background worker function that enriches cards in DeckCard and CollectionCard
 * where imageUri is missing.
 *
 * Rate Limiting & Throttling:
 * - Processes in batches of up to 75 cards (Scryfall limit).
 * - Applies a 100ms courtesy delay between HTTP requests to guarantee 0 HTTP 429 errors.
 * - Stores all resolved metadata in `CardCatalog` table for zero-latency local caching.
 */
export async function processPendingCardsWorker(options?: {
  batchSize?: number;
  delayMs?: number;
  maxTotalToProcess?: number;
}): Promise<WorkerEnrichmentResult> {
  const batchSize = Math.min(options?.batchSize ?? 75, 75);
  const delayMs = options?.delayMs ?? 100;
  const maxTotal = options?.maxTotalToProcess ?? 300;

  const result: WorkerEnrichmentResult = {
    totalPending: 0,
    resolvedFromCache: 0,
    resolvedFromScryfall: 0,
    notFoundCount: 0,
    errorsCount: 0,
  };

  try {
    // 1. Find cards in deck_cards and user_collections that are missing images
    const [pendingDeckCards, pendingCollectionCards] = await Promise.all([
      prisma.deckCard.findMany({
        where: { imageUri: null },
        take: maxTotal,
        select: { id: true, cardName: true, deckId: true },
      }),
      prisma.collectionCard.findMany({
        where: { imageUri: null },
        take: maxTotal,
        select: { id: true, cardName: true, userId: true },
      }),
    ]);

    result.totalPending = pendingDeckCards.length + pendingCollectionCards.length;
    if (result.totalPending === 0) {
      return result;
    }

    // Collect all distinct card names to resolve
    const distinctNames = Array.from(
      new Set([
        ...pendingDeckCards.map((c) => c.cardName.trim()),
        ...pendingCollectionCards.map((c) => c.cardName.trim()),
      ])
    );

    // 2. Step 1: Check local CardCatalog cache first
    const normalizedNames = distinctNames.map((name) => normalizeCardName(name));
    let cachedRecords: Array<{
      id: string;
      name: string;
      normalizedName: string;
      imageUri: string | null;
      manaCost: string | null;
      typeLine: string | null;
      setCode: string | null;
      collectorNumber: string | null;
    }> = [];

    try {
      if (prisma.cardCatalog?.findMany) {
        cachedRecords = await prisma.cardCatalog.findMany({
          where: {
            normalizedName: { in: normalizedNames },
          },
        });
      }
    } catch (e) {
      console.warn("Worker could not read cardCatalog:", e);
    }

    const cacheMap = new Map<string, (typeof cachedRecords)[0]>();
    for (const record of cachedRecords) {
      cacheMap.set(record.normalizedName, record);
    }


    const uncachedNames: string[] = [];
    for (const originalName of distinctNames) {
      const norm = normalizeCardName(originalName);
      if (cacheMap.has(norm)) {
        result.resolvedFromCache++;
      } else {
        uncachedNames.push(originalName);
      }
    }

    // 3. Apply cached data to pending cards in database
    if (cachedRecords.length > 0) {
      for (const deckCard of pendingDeckCards) {
        const cached = cacheMap.get(normalizeCardName(deckCard.cardName));
        if (cached) {
          await prisma.deckCard.update({
            where: { id: deckCard.id },
            data: {
              imageUri: cached.imageUri,
              manaCost: cached.manaCost,
              typeLine: cached.typeLine,
              cardScryfallId: cached.id,
            },
          }).catch(() => {
            // Ignore unique constraint collisions if any
          });
        }
      }

      for (const collCard of pendingCollectionCards) {
        const cached = cacheMap.get(normalizeCardName(collCard.cardName));
        if (cached) {
          await prisma.collectionCard.update({
            where: { id: collCard.id },
            data: {
              imageUri: cached.imageUri,
              manaCost: cached.manaCost,
              typeLine: cached.typeLine,
              cardScryfallId: cached.id,
            },
          }).catch(() => {});
        }
      }
    }

    // 4. Step 2: Fetch uncached cards from Scryfall in batches of 75 with rate-limiting
    if (uncachedNames.length > 0) {
      for (let i = 0; i < uncachedNames.length; i += batchSize) {
        const currentBatch = uncachedNames.slice(i, i + batchSize);
        const identifiers = currentBatch.map((name) => ({ name }));

        try {
          const response = await fetch(SCRYFALL_COLLECTION_URL, {
            method: "POST",
            headers: SCRYFALL_HEADERS,
            body: JSON.stringify({ identifiers }),
          });

          if (response.status === 429) {
            console.warn("⚠️ Scryfall Rate Limit 429 encountered, backing off for 1.5s...");
            await sleep(1500);
            result.errorsCount++;
            continue;
          }

          if (!response.ok) {
            console.error(`Scryfall HTTP error ${response.status}`);
            result.errorsCount++;
            continue;
          }

          const json = await response.json();
          const foundCards: Array<{
            id: string;
            name: string;
            mana_cost?: string;
            type_line?: string;
            image_uris?: { normal?: string; small?: string };
            card_faces?: Array<{
              mana_cost?: string;
              type_line?: string;
              image_uris?: { normal?: string; small?: string };
            }>;
            set?: string;
            collector_number?: string;
          }> = json.data || [];

          if (json.not_found && Array.isArray(json.not_found)) {
            result.notFoundCount += json.not_found.length;
          }

          // Process and persist newly resolved cards
          for (const card of foundCards) {
            const imageUri =
              card.image_uris?.normal ||
              card.image_uris?.small ||
              card.card_faces?.[0]?.image_uris?.normal ||
              null;

            const manaCost = card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? null;
            const typeLine = card.type_line ?? card.card_faces?.[0]?.type_line ?? null;
            const norm = normalizeCardName(card.name);

            // Upsert into CardCatalog cache
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
            }).catch((err) => console.warn("CardCatalog upsert error:", err));

            // Update matching pending deck cards
            await prisma.deckCard.updateMany({
              where: {
                cardName: { equals: card.name, mode: "insensitive" },
                imageUri: null,
              },
              data: {
                imageUri,
                manaCost,
                typeLine,
                cardScryfallId: card.id,
              },
            });

            // Update matching pending collection cards
            await prisma.collectionCard.updateMany({
              where: {
                cardName: { equals: card.name, mode: "insensitive" },
                imageUri: null,
              },
              data: {
                imageUri,
                manaCost,
                typeLine,
                cardScryfallId: card.id,
              },
            });

            result.resolvedFromScryfall++;
          }
        } catch (fetchError) {
          console.error("Worker batch fetch error:", fetchError);
          result.errorsCount++;
        }

        // Polite delay between Scryfall calls to respect 50-100ms rule
        if (i + batchSize < uncachedNames.length) {
          await sleep(delayMs);
        }
      }
    }
  } catch (err) {
    console.error("Error in processPendingCardsWorker:", err);
  }

  return result;
}
