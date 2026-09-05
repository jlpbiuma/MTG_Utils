import { NextResponse } from "next/server";
import { getPriceSummary, PriceProvider } from "@/lib/pricing";
import { getDeckPriceSummary, getCollectionPriceSummary } from "@/actions/pricing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const provider: PriceProvider = body.provider || "cardmarket";
    const bypassCache = Boolean(body.bypassCache);

    if (body.deckId) {
      const summary = await getDeckPriceSummary(body.deckId, provider, bypassCache);
      if (!summary) {
        return NextResponse.json({ error: "Deck not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, summary });
    }

    if (body.type === "collection") {
      const summary = await getCollectionPriceSummary(provider, bypassCache);
      return NextResponse.json({ success: true, summary });
    }

    if (Array.isArray(body.cards)) {
      const summary = await getPriceSummary(body.cards, provider, bypassCache);
      return NextResponse.json({ success: true, summary });
    }

    return NextResponse.json({ error: "Missing deckId, type=collection, or cards array" }, { status: 400 });
  } catch (error) {
    console.error("Price API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
