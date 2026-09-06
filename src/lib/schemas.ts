import { z } from "zod";

export const DeckCreateSchema = z.object({
  name: z.string().min(1, "El nombre del mazo es obligatorio").max(100),
  format: z.string().default("Commander"),
  description: z.string().optional(),
});

export const DeckUpdateSchema = z.object({
  name: z.string().min(1, "El nombre del mazo no puede estar vacío").max(100).optional(),
  format: z.string().optional(),
  description: z.string().optional(),
});

export const DeckCardCreateSchema = z.object({
  cardScryfallId: z.string().min(1),
  cardName: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  isSideboard: z.boolean().default(false),
  manaCost: z.string().nullable().optional(),
  typeLine: z.string().nullable().optional(),
  imageUri: z.string().nullable().optional(),
});

export const CollectionCardCreateSchema = z.object({
  cardScryfallId: z.string().min(1),
  cardName: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  setCode: z.string().nullable().optional(),
  collectorNumber: z.string().nullable().optional(),
  manaCost: z.string().nullable().optional(),
  typeLine: z.string().nullable().optional(),
  imageUri: z.string().nullable().optional(),
});

export type DeckCreateInput = z.infer<typeof DeckCreateSchema>;
export type DeckUpdateInput = z.infer<typeof DeckUpdateSchema>;
export type DeckCardCreateInput = z.infer<typeof DeckCardCreateSchema>;
export type CollectionCardCreateInput = z.infer<typeof CollectionCardCreateSchema>;

export interface DeckWithCompletion {
  id: string;
  userId: string;
  name: string;
  format: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  totalCards: number;
  uniqueCards: number;
  ownedCards: number;
  missingCardsCount: number;
  completionPercentage: number;
}

export interface OtherDeckAssignment {
  deckId: string;
  deckName: string;
  quantity: number;
}

export interface DeckCardWithOwnership {
  id: string;
  deckId: string;
  cardScryfallId: string;
  cardName: string;
  quantity: number;
  assignedQuantity: number;
  isSideboard: boolean;
  manaCost: string | null;
  typeLine: string | null;
  imageUri: string | null;
  ownedInCollection: number;
  availableToAssign: number;
  assignedInOtherDecks: OtherDeckAssignment[];
  missingCount: number;
}

export interface DeckDetailWithStats extends DeckWithCompletion {
  cards: DeckCardWithOwnership[];
}

