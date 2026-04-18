export const HL_INFO_URL = "https://api.hyperliquid.xyz/info";

export const INTERVALS = [
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "8h", "12h",
  "1d", "3d", "1w", "1M",
] as const;

export type Interval = (typeof INTERVALS)[number];

const INTERVAL_MS: Record<Interval, number> = {
  "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
  "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000, "8h": 28_800_000,
  "12h": 43_200_000, "1d": 86_400_000, "3d": 259_200_000, "1w": 604_800_000,
  "1M": 2_592_000_000,
};

export interface Candle {
  time: number;       // unix seconds (lightweight-charts format)
  timeMs: number;     // unix milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function normalizeCoin(pair: string): string {
  let p = pair.toUpperCase().replace(/\s+/g, "");
  for (const sep of ["-", "/", ":"]) {
    if (p.includes(sep)) {
      p = p.split(sep)[0];
      break;
    }
  }
  for (const suffix of ["USDT", "USDC", "USD", "PERP"]) {
    if (p.endsWith(suffix) && p.length > suffix.length) {
      p = p.slice(0, -suffix.length);
    }
  }
  return p;
}

export async function fetchCandles(
  pair: string,
  interval: Interval,
  lookback = 500,
  endTimeMs?: number,
): Promise<Candle[]> {
  const coin = normalizeCoin(pair);
  const stepMs = INTERVAL_MS[interval];
  const endMs = endTimeMs ?? Date.now();
  const startMs = endMs - stepMs * lookback;

  const res = await fetch(HL_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin, interval, startTime: startMs, endTime: endMs },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Hyperliquid API ${res.status}: ${await res.text().catch(() => "")}`.trim());
  }

  const raw = (await res.json()) as Array<{
    t: number; T: number; s: string; i: string;
    o: string | number; h: string | number; l: string | number;
    c: string | number; v: string | number; n?: number;
  }>;

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`No candles returned for coin "${coin}". Invalid Hyperliquid perp symbol?`);
  }

  return raw
    .map((r) => ({
      timeMs: r.t,
      time: Math.floor(r.t / 1000),
      open: Number(r.o),
      high: Number(r.h),
      low: Number(r.l),
      close: Number(r.c),
      volume: Number(r.v),
    }))
    .sort((a, b) => a.time - b.time);
}
