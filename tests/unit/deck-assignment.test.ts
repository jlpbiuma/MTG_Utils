import { describe, it, expect } from "vitest";

describe("Cross-Deck Card Assignment Logic", () => {
  interface MockDeckCard {
    id: string;
    deckId: string;
    deckName: string;
    cardName: string;
    scryfallId: string;
    quantity: number;
    assignedQuantity: number;
  }

  function calculateCardAssignmentState(
    currentDeckId: string,
    targetCard: { cardName: string; scryfallId: string; quantity: number; assignedQuantity: number },
    ownedInCollection: number,
    allUserDeckCards: MockDeckCard[]
  ) {
    const norm = targetCard.cardName.toLowerCase().trim();

    // All assignments across all decks for this card
    const matchingAssignments = allUserDeckCards.filter(
      (c) =>
        (c.scryfallId === targetCard.scryfallId || c.cardName.toLowerCase().trim() === norm) &&
        c.assignedQuantity > 0
    );

    const totalAssignedAcrossAllDecks = matchingAssignments.reduce(
      (sum, c) => sum + c.assignedQuantity,
      0
    );

    const availableToAssign = Math.max(0, ownedInCollection - totalAssignedAcrossAllDecks);

    const assignedInOtherDecks = matchingAssignments
      .filter((c) => c.deckId !== currentDeckId)
      .map((c) => ({
        deckId: c.deckId,
        deckName: c.deckName,
        quantity: c.assignedQuantity,
      }));

    return {
      assignedQuantity: targetCard.assignedQuantity,
      availableToAssign,
      assignedInOtherDecks,
      hasEnoughFreeCopies: availableToAssign >= targetCard.quantity - targetCard.assignedQuantity,
    };
  }

  it("should detect when a card is already assigned to another deck and show which deck it is in", () => {
    // User owns 1 Sol Ring
    const ownedInCollection = 1;

    // Deck A already has 1 copy assigned
    const allDeckCards: MockDeckCard[] = [
      {
        id: "card-1",
        deckId: "deck-a",
        deckName: "Commander Urza",
        cardName: "Sol Ring",
        scryfallId: "scry-sol-ring",
        quantity: 1,
        assignedQuantity: 1,
      },
      {
        id: "card-2",
        deckId: "deck-b",
        deckName: "Commander Atraxa",
        cardName: "Sol Ring",
        scryfallId: "scry-sol-ring",
        quantity: 1,
        assignedQuantity: 0,
      },
    ];

    // Viewing Deck B (Atraxa)
    const state = calculateCardAssignmentState(
      "deck-b",
      allDeckCards[1],
      ownedInCollection,
      allDeckCards
    );

    expect(state.assignedQuantity).toBe(0);
    expect(state.availableToAssign).toBe(0); // 1 owned - 1 in Deck A = 0 free!
    expect(state.assignedInOtherDecks).toHaveLength(1);
    expect(state.assignedInOtherDecks[0].deckName).toBe("Commander Urza");
    expect(state.assignedInOtherDecks[0].quantity).toBe(1);
    expect(state.hasEnoughFreeCopies).toBe(false);
  });

  it("should allow assignment when collection has enough free unassigned copies", () => {
    // User owns 3 Lightning Bolts
    const ownedInCollection = 3;

    // Deck A has 1 assigned
    const allDeckCards: MockDeckCard[] = [
      {
        id: "card-1",
        deckId: "deck-a",
        deckName: "Burn Modern",
        cardName: "Lightning Bolt",
        scryfallId: "scry-bolt",
        quantity: 4,
        assignedQuantity: 1,
      },
      {
        id: "card-2",
        deckId: "deck-b",
        deckName: "Pauper Delver",
        cardName: "Lightning Bolt",
        scryfallId: "scry-bolt",
        quantity: 2,
        assignedQuantity: 0,
      },
    ];

    // Viewing Deck B: 3 owned - 1 assigned in Deck A = 2 available!
    const state = calculateCardAssignmentState(
      "deck-b",
      allDeckCards[1],
      ownedInCollection,
      allDeckCards
    );

    expect(state.availableToAssign).toBe(2);
    expect(state.hasEnoughFreeCopies).toBe(true);
    expect(state.assignedInOtherDecks[0].deckName).toBe("Burn Modern");
    expect(state.assignedInOtherDecks[0].quantity).toBe(1);
  });

  it("should calculate correctly after releasing (unassigning) a copy", () => {
    let ownedInCollection = 1;
    const allDeckCards: MockDeckCard[] = [
      {
        id: "card-1",
        deckId: "deck-a",
        deckName: "Mazo 1",
        cardName: "Rhystic Study",
        scryfallId: "scry-rhystic",
        quantity: 1,
        assignedQuantity: 1,
      },
      {
        id: "card-2",
        deckId: "deck-b",
        deckName: "Mazo 2",
        cardName: "Rhystic Study",
        scryfallId: "scry-rhystic",
        quantity: 1,
        assignedQuantity: 0,
      },
    ];

    // Initially Deck B has 0 available
    let state = calculateCardAssignmentState("deck-b", allDeckCards[1], ownedInCollection, allDeckCards);
    expect(state.availableToAssign).toBe(0);

    // Unassign from Deck A
    allDeckCards[0].assignedQuantity = 0;

    // Now Deck B has 1 available to assign!
    state = calculateCardAssignmentState("deck-b", allDeckCards[1], ownedInCollection, allDeckCards);
    expect(state.availableToAssign).toBe(1);
    expect(state.assignedInOtherDecks).toHaveLength(0);
  });
});
