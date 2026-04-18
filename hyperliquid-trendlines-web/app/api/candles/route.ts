import { NextRequest, NextResponse } from "next/server";
import { fetchCandles, INTERVALS, type Interval } from "@/lib/hyperliquid";
import { detectBreakouts, detectTrendlines } from "@/lib/trendlines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const pair = sp.get("pair")?.trim();
  const interval = sp.get("interval") as Interval | null;
  const lookback = Math.min(Math.max(parseInt(sp.get("lookback") ?? "400", 10) || 400, 50), 2000);

  if (!pair) {
    return NextResponse.json({ error: "pair is required" }, { status: 400 });
  }
  if (!interval || !INTERVALS.includes(interval)) {
    return NextResponse.json(
      { error: `interval must be one of ${INTERVALS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const candles = await fetchCandles(pair, interval, lookback);
    const lines = detectTrendlines(candles);
    const breakouts = detectBreakouts(candles, lines);
    return NextResponse.json({ pair, interval, candles, lines, breakouts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
