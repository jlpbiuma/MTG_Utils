import { getUserCollection, getCollectionStats } from "@/actions/collection";
import { CollectionView } from "@/components/collection-view";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const [cards, stats] = await Promise.all([
    getUserCollection(),
    getCollectionStats(),
  ]);

  return <CollectionView initialCards={cards} initialStats={stats} />;
}
