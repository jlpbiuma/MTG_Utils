/**
 * EDHREC API client and recommendations extractor.
 * Fetches community commander recommendations from https://json.edhrec.com
 * with in-memory 24h caching.
 */

import { normalizeCardName } from "./card-utils";

export interface EdhrecRawCardview {
  id: string;
  name: string;
  sanitized: string;
  slug?: string;
  url?: string;
  synergy?: number;
  num_decks?: number;
  potential_decks?: number;
  trend_zscore?: number;
}

export interface EdhrecRawCardlist {
  tag: string;
  header: string;
  cardviews: EdhrecRawCardview[];
}

export interface EdhrecParsedCard {
  id: string;
  name: string;
  normalizedName: string;
  sanitized: string;
  category: string;
  categories: string[];
  numDecks: number;
  potentialDecks: number;
  inclusionPct: number;
  synergy: number;
  imageUri: string | null;
}

export interface EdhrecCommanderResponse {
  commander: {
    name: string;
    id: string;
    imageUri: string | null;
    numDecks: number;
    colorIdentity: string[];
    typeLine: string;
  } | null;
  categories: string[];
  cards: EdhrecParsedCard[];
}

// In-memory cache with 24-hour TTL
interface CacheEntry {
  timestamp: number;
  data: EdhrecCommanderResponse;
}

const edhrecCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Converts a Magic card / commander name into an EDHREC-compatible URL slug.
 * Strips accents, punctuation, handles split/partner card slashes, and downcases.
 */
export function toEdhrecSlug(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\s*\/\/\s*/g, "-") // handle dual / partner slashes
    .replace(/[^a-z0-9\s-]/g, "") // strip punctuation (commas, quotes, etc.)
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Builds the EDHREC image CDN URL given a Scryfall UUID.
 */
export function getEdhrecCardImageUrl(id: string): string | null {
  if (!id || id.length < 2) return null;
  return `https://card-images.edhrec.com/normal/front/${id.charAt(0)}/${id.charAt(1)}/${id}.jpg`;
}

/**
 * Fetches and parses EDHREC commander page data.
 */
export async function fetchEdhrecCommanderData(
  commanderName: string
): Promise<EdhrecCommanderResponse | null> {
  const slug = toEdhrecSlug(commanderName);
  if (!slug) return null;

  // Check cache
  const cached = edhrecCache.get(slug);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `https://json.edhrec.com/pages/commanders/${slug}.json`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "MTGUtils/1.0",
      },
      next: { revalidate: 86400 }, // Next.js fetch cache 24h
    });

    if (!res.ok) {
      if (res.status === 404) {
        console.warn(`[EDHREC] Commander not found for slug '${slug}' (${commanderName})`);
        return null;
      }
      throw new Error(`EDHREC HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const jsonDict = data?.container?.json_dict;
    if (!jsonDict) {
      console.warn(`[EDHREC] Missing json_dict in payload for '${slug}'`);
      return null;
    }

    // Parse commander info
    const rawCmd = jsonDict.card;
    const commander = rawCmd
      ? {
          name: rawCmd.name || commanderName,
          id: rawCmd.id || "",
          imageUri:
            rawCmd.image_uris?.[0]?.normal ||
            (rawCmd.id ? getEdhrecCardImageUrl(rawCmd.id) : null),
          numDecks: rawCmd.num_decks || 0,
          colorIdentity: rawCmd.color_identity || [],
          typeLine: rawCmd.type_line || "",
        }
      : null;

    // Parse cards from all cardlists
    const cardlists: EdhrecRawCardlist[] = jsonDict.cardlists || [];
    const cardMap = new Map<string, EdhrecParsedCard>();
    const categoryList: string[] = [];

    for (const list of cardlists) {
      const header = list.header || list.tag;
      if (!categoryList.includes(header)) {
        categoryList.push(header);
      }

      for (const cv of list.cardviews || []) {
        if (!cv.name) continue;
        const norm = normalizeCardName(cv.name);
        const existing = cardMap.get(norm);

        const numDecks = cv.num_decks ?? 0;
        const potentialDecks = cv.potential_decks ?? 1;
        const rawInclusion = potentialDecks > 0 ? (numDecks / potentialDecks) * 100 : 0;
        const inclusionPct = Math.round(rawInclusion * 10) / 10;
        const synergy = Math.round((cv.synergy ?? 0) * 1000) / 10; // e.g. 0.354 -> 35.4%
        const imageUri = cv.id ? getEdhrecCardImageUrl(cv.id) : null;

        if (!existing) {
          cardMap.set(norm, {
            id: cv.id || "",
            name: cv.name,
            normalizedName: norm,
            sanitized: cv.sanitized || "",
            category: header,
            categories: [header],
            numDecks,
            potentialDecks,
            inclusionPct,
            synergy,
            imageUri,
          });
        } else {
          // Add category
          if (!existing.categories.includes(header)) {
            existing.categories.push(header);
          }
          // If this list gives better stats (e.g. potential_decks wasn't available in earlier list), update
          if (inclusionPct > existing.inclusionPct) {
            existing.inclusionPct = inclusionPct;
            existing.numDecks = numDecks;
            existing.potentialDecks = potentialDecks;
          }
          if (synergy > existing.synergy) {
            existing.synergy = synergy;
          }
          if (!existing.imageUri && imageUri) {
            existing.imageUri = imageUri;
          }
        }
      }
    }

    // Sort cards by inclusion % descending
    const parsedCards = Array.from(cardMap.values()).sort(
      (a, b) => b.inclusionPct - a.inclusionPct
    );

    const result: EdhrecCommanderResponse = {
      commander,
      categories: categoryList,
      cards: parsedCards,
    };

    // Save to cache
    edhrecCache.set(slug, {
      timestamp: now,
      data: result,
    });

    return result;
  } catch (error) {
    console.error(`[EDHREC] Error fetching commander data for '${commanderName}' (${slug}):`, error);
    return null;
  }
}
