import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchCards, autocompleteCards, getCardNamed } from "@/actions/scryfall";

describe("Scryfall Server Actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return empty result for blank query without calling API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await searchCards("   ");

    expect(res.total_cards).toBe(0);
    expect(res.data).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should search cards and return formatted results", async () => {
    const mockResponse = {
      total_cards: 1,
      has_more: false,
      data: [
        {
          id: "card-uuid-1",
          name: "Black Lotus",
          mana_cost: "{0}",
          type_line: "Artifact",
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const res = await searchCards("Black Lotus");

    expect(res.total_cards).toBe(1);
    expect(res.data[0].name).toBe("Black Lotus");
    expect(res.data[0].mana_cost).toBe("{0}");
  });

  it("should handle Scryfall 404 cleanly by returning empty list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ status: 404, details: "No cards found" }),
    } as Response);

    const res = await searchCards("NonExistentCardXYZ12345");

    expect(res.total_cards).toBe(0);
    expect(res.data).toEqual([]);
  });

  it("should autocomplete card names", async () => {
    const mockAutocomplete = {
      data: ["Lightning Bolt", "Lightning Helix", "Lightning Strike"],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockAutocomplete,
    } as Response);

    const names = await autocompleteCards("Light");

    expect(names).toHaveLength(3);
    expect(names).toContain("Lightning Bolt");
  });
});
