import { notFound } from "next/navigation";
import { getDeckDetail } from "@/actions/decks";
import { DeckDetailView } from "@/components/deck-detail-view";

interface DeckDetailPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function DeckDetailPage({ params }: DeckDetailPageProps) {
  const { id } = await params;
  const deck = await getDeckDetail(id);

  if (!deck) {
    notFound();
  }

  return <DeckDetailView initialDeck={deck} />;
}
