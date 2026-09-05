"use server";

export interface ScryfallCardResult {
  id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  set?: string;
  set_name?: string;
  collector_number?: string;
  rarity?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    art_crop?: string;
  };
  card_faces?: Array<{
    name: string;
    mana_cost?: string;
    type_line?: string;
    image_uris?: {
      small?: string;
      normal?: string;
      large?: string;
      art_crop?: string;
    };
  }>;
}

const SCRYFALL_BASE = "https://api.scryfall.com";
const SCRYFALL_HEADERS = {
  "User-Agent": "MTGUtils/1.0 (fullstack-nextjs-app)",
  Accept: "application/json;q=0.9,*/*;q=0.8",
};

/**
 * Searches cards on Scryfall using native fetch with caching.
 */
export async function searchCards(
  query: string,
  page: number = 1
): Promise<{ total_cards: number; has_more: boolean; data: ScryfallCardResult[] }> {
  if (!query || query.trim().length === 0) {
    return { total_cards: 0, has_more: false, data: [] };
  }

  const encodedQuery = encodeURIComponent(query.trim());
  const url = `${SCRYFALL_BASE}/cards/search?q=${encodedQuery}&page=${page}`;

  try {
    const res = await fetch(url, {
      headers: SCRYFALL_HEADERS,
      next: { revalidate: 3600 }, // Cache card search results for 1 hour
    });

    if (res.status === 404) {
      return { total_cards: 0, has_more: false, data: [] };
    }

    if (!res.ok) {
      throw new Error(`Scryfall returned status ${res.status}`);
    }

    const data = await res.json();
    return {
      total_cards: data.total_cards || 0,
      has_more: !!data.has_more,
      data: data.data || [],
    };
  } catch (error) {
    console.error("Error fetching cards from Scryfall:", error);
    return { total_cards: 0, has_more: false, data: [] };
  }
}

/**
 * Autocompletes card names in real time.
 */
export async function autocompleteCards(query: string): Promise<string[]> {
  if (!query || query.trim().length < 2) return [];

  const encoded = encodeURIComponent(query.trim());
  const url = `${SCRYFALL_BASE}/cards/autocomplete?q=${encoded}`;

  try {
    const res = await fetch(url, {
      headers: SCRYFALL_HEADERS,
      next: { revalidate: 86400 }, // Cache name autocomplete for 24h
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  } catch (error) {
    console.error("Error in card autocomplete:", error);
    return [];
  }
}

/**
 * Fetches a single card by exact or fuzzy name.
 */
export async function getCardNamed(name: string, exact: boolean = false): Promise<ScryfallCardResult | null> {
  const param = exact ? "exact" : "fuzzy";
  const url = `${SCRYFALL_BASE}/cards/named?${param}=${encodeURIComponent(name.trim())}`;

  try {
    const res = await fetch(url, {
      headers: SCRYFALL_HEADERS,
      next: { revalidate: 86400 },
    });

    if (res.status === 404) return null;
    if (!res.ok) return null;

    return await res.json();
  } catch (error) {
    console.error("Error fetching card named:", error);
    return null;
  }
}
