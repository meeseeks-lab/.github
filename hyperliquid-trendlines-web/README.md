# hyperliquid-trendlines-web

Next.js app (App Router, deployable to Vercel) that:

1. Fetches OHLCV candles for any Hyperliquid perp pair you type in.
2. Auto-draws support / resistance trendlines using fractal pivots, with a 3+
   touch requirement and no-violation validation.
3. Renders everything on a dark candlestick chart via TradingView's
   `lightweight-charts`, plus volume histogram and breakout markers.

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

Pick a pair (`BTC`, `ETH`, `SOL`, `HYPE`, …), pick a timeframe (`1m` – `1M`),
choose a candle count, and hit Load chart.

## Deploy to Vercel

1. Push this folder to its own GitHub repo (or let Vercel point at the
   subdirectory).
2. `vercel` CLI: `vercel` then `vercel --prod`. Or import the repo in the
   Vercel dashboard — the defaults work (Next.js preset, Node runtime).
3. No environment variables are required. The API route `/api/candles` runs
   server-side and forwards to `https://api.hyperliquid.xyz/info`, which sidesteps
   any browser CORS concerns.

## Architecture

```
app/
  page.tsx              - client: controls + chart + breakout list
  api/candles/route.ts  - server: proxies Hyperliquid, runs trendline analysis
components/
  Controls.tsx          - pair / timeframe / lookback form
  Chart.tsx             - lightweight-charts candlestick + lines + markers
lib/
  hyperliquid.ts        - REST client + pair normaliser
  trendlines.ts         - pivot detection, line search, breakout detection
```

## Breakout rules

From the research on angled crypto trendlines:

- Pivots: fractal highs/lows with a 3-bar window on each side.
- Trendline needs 3+ touches, never crosses into the price series
  (with a 0.15% tolerance for wick noise).
- Best-fit refinement: least-squares re-fit over all near-line pivots, only
  accepted if it still respects the no-violation rule.
- Breakout: first close that's 0.1%+ through the line, with either
  volume >= 1.3x the 20-bar rolling average OR a confirmed retest within 10 bars.

## Tuning

Defaults are in `app/api/candles/route.ts` (passed through to
`detectTrendlines` / `detectBreakouts`). Expose them as query params if you
want to experiment — e.g. `tolPct`, `minTouches`, `volumeMultiplier`.
