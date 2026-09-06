import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SelectCommanderDialog } from "@/components/select-commander-dialog";
import { DeckCardWithOwnership } from "@/lib/schemas";

// Mock server action
vi.mock("@/actions/decks", () => ({
  setDeckCommander: vi.fn().mockResolvedValue({
    commander: "Niv-Mizzet, Parun",
    commanderScryfallId: "mock-id-1",
    commanderImageUri: "https://example.com/niv.jpg",
  }),
}));

describe("SelectCommanderDialog Component", () => {
  const mockCards: DeckCardWithOwnership[] = [
    {
      id: "card-1",
      deckId: "deck-1",
      cardScryfallId: "scry-1",
      cardName: "Niv-Mizzet, Parun",
      quantity: 1,
      assignedQuantity: 1,
      isSideboard: false,
      isCommander: false,
      manaCost: "{U}{U}{U}{R}{R}{R}",
      typeLine: "Legendary Creature — Dragon Wizard",
      imageUri: "https://example.com/niv.jpg",
      ownedInCollection: 1,
      availableToAssign: 0,
      assignedInOtherDecks: [],
      missingCount: 0,
    },
    {
      id: "card-2",
      deckId: "deck-1",
      cardScryfallId: "scry-2",
      cardName: "Guttersnipe",
      quantity: 1,
      assignedQuantity: 1,
      isSideboard: false,
      isCommander: false,
      manaCost: "{2}{R}",
      typeLine: "Creature — Goblin Shaman",
      imageUri: "https://example.com/gutter.jpg",
      ownedInCollection: 1,
      availableToAssign: 0,
      assignedInOtherDecks: [],
      missingCount: 0,
    },
    {
      id: "card-3",
      deckId: "deck-1",
      cardScryfallId: "scry-3",
      cardName: "Counterspell",
      quantity: 1,
      assignedQuantity: 1,
      isSideboard: false,
      isCommander: false,
      manaCost: "{U}{U}",
      typeLine: "Instant",
      imageUri: null,
      ownedInCollection: 1,
      availableToAssign: 0,
      assignedInOtherDecks: [],
      missingCount: 0,
    },
  ];

  it("should render dialog title and candidate creatures while excluding non-creatures", () => {
    render(
      <SelectCommanderDialog
        deckId="deck-1"
        deckName="Izzet Spells"
        open={true}
        onOpenChange={vi.fn()}
        deckCards={mockCards}
        currentCommander={null}
        onCommanderSelected={vi.fn()}
      />
    );

    expect(screen.getByText("Asignar Comandante al Mazo")).toBeInTheDocument();
    expect(screen.getByText("Niv-Mizzet, Parun")).toBeInTheDocument();
    expect(screen.getByText("Guttersnipe")).toBeInTheDocument();
    // Non-creature / non-legendary cards should not be candidates
    expect(screen.queryByText("Counterspell")).not.toBeInTheDocument();
  });

  it("should display 'Legendaria' badge for legendary creatures", () => {
    render(
      <SelectCommanderDialog
        deckId="deck-1"
        deckName="Izzet Spells"
        open={true}
        onOpenChange={vi.fn()}
        deckCards={mockCards}
        currentCommander={null}
        onCommanderSelected={vi.fn()}
      />
    );

    expect(screen.getByText("Legendaria")).toBeInTheDocument();
  });

  it("should allow typing a custom commander name", () => {
    render(
      <SelectCommanderDialog
        deckId="deck-1"
        deckName="Izzet Spells"
        open={true}
        onOpenChange={vi.fn()}
        deckCards={mockCards}
        currentCommander={null}
        onCommanderSelected={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/ej: Niv-Mizzet, Parun/i);
    fireEvent.change(input, { target: { value: "Kaza, Roil Chaser" } });

    expect(input).toHaveValue("Kaza, Roil Chaser");
  });
});
