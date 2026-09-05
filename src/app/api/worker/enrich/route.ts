import { NextResponse } from "next/server";
import { processPendingCardsWorker } from "@/lib/worker";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const maxTotal = url.searchParams.get("max") ? parseInt(url.searchParams.get("max")!, 10) : 300;

    const result = await processPendingCardsWorker({
      batchSize: 75,
      delayMs: 100,
      maxTotalToProcess: maxTotal,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Worker API route error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
