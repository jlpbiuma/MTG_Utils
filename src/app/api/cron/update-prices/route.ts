import { NextRequest, NextResponse } from "next/server";
import { runWeeklyCollectionPricingWorker } from "@/lib/pricing-worker";

export const dynamic = "force-dynamic";

/**
 * Weekly Cron endpoint to update prices of all collection cards.
 * Can be invoked via scheduled cron (Netlify Scheduled Functions, Vercel Cron, GitHub Actions, crontab):
 *   GET /api/cron/update-prices -H "Authorization: Bearer <CRON_SECRET>"
 */
export async function GET(request: NextRequest) {
  return handlePricingCron(request);
}

export async function POST(request: NextRequest) {
  return handlePricingCron(request);
}

async function handlePricingCron(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // If CRON_SECRET is configured, enforce Bearer authentication
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized. Valid Bearer token required for cron." },
      { status: 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;
    const delayMs = searchParams.get("delay") ? parseInt(searchParams.get("delay")!, 10) : 100;

    const result = await runWeeklyCollectionPricingWorker({ limit, delayMs });

    return NextResponse.json({
      message: "Weekly collection pricing update completed",
      result,
    });
  } catch (error) {
    console.error("Pricing cron error:", error);
    return NextResponse.json(
      { error: "Pricing cron execution failed", details: String(error) },
      { status: 500 }
    );
  }
}
