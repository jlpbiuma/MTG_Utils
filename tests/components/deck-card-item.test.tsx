import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DeckCardItem } from "@/components/deck-card-item";
import { DeckWithCompletion } from "@/lib/schemas";

describe("DeckCardItem Component", () => {
  const baseDeck: DeckWithCompletion = {
    id: "deck-123",
    userId: "user-1",
    name: "Atris Blink",
    format: "Commander",
    description: "Reanimate and blink ETB value",
    commander: "Atris, Oracle of Half-Truths",
    commanderScryfallId: null,
    commanderImageUri: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    totalCards: 100,
    uniqueCards: 100,
    ownedCards: 75,
    missingCardsCount: 25,
    completionPercentage: 75,
  };

  it("should render deck name, format, and description", () => {
    render(<DeckCardItem deck={baseDeck} />);

    expect(screen.getByText("Atris Blink")).toBeInTheDocument();
    expect(screen.getByText("Commander")).toBeInTheDocument();
    expect(screen.getByText("Reanimate and blink ETB value")).toBeInTheDocument();
  });

  it("should display completion percentage and missing count for incomplete deck", () => {
    render(<DeckCardItem deck={baseDeck} />);

    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("75")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText(/cartas/i)).toBeInTheDocument();
    expect(screen.getByText(/Faltan 25/i)).toBeInTheDocument();
  });

  it("should display '¡Completado!' badge when all cards are owned", () => {
    const completeDeck: DeckWithCompletion = {
      ...baseDeck,
      ownedCards: 100,
      missingCardsCount: 0,
      completionPercentage: 100,
    };

    render(<DeckCardItem deck={completeDeck} />);

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("¡Completado!")).toBeInTheDocument();
  });

  it("should have link to deck details", () => {
    render(<DeckCardItem deck={baseDeck} />);

    const link = screen.getByRole("link", { name: /Ver Mazo y Faltantes/i });
    expect(link).toHaveAttribute("href", "/decks/deck-123");
  });

  it("should display commander name when deck has an assigned commander", () => {
    render(<DeckCardItem deck={baseDeck} />);

    expect(screen.getByText("Atris, Oracle of Half-Truths")).toBeInTheDocument();
    expect(screen.getByText(/Comandante:/i)).toBeInTheDocument();
  });

  it("should display warning alert when deck has no assigned commander", () => {
    const deckWithoutCommander: DeckWithCompletion = {
      ...baseDeck,
      commander: null,
    };

    render(<DeckCardItem deck={deckWithoutCommander} />);

    expect(screen.getByText("Sin comandante asignado")).toBeInTheDocument();
  });
});
