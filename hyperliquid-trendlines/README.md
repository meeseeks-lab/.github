# hyperliquid-trendlines

Pulls OHLCV candles for any Hyperliquid perp pair, auto-draws angled support /
resistance trendlines using the rules from the breakout research, and flags
decisive closes through those lines with volume confirmation.

## Rules encoded

Derived from the online research on angled trendlines for crypto breakouts:

- **Pivots**: classical fractal highs/lows (configurable left/right window).
- **Validity**: a trendline needs at least 3 touches; two points alone are
  never treated as confirmed.
- **No violations**: support lines must stay below every low in the window,
  resistance lines above every high (small tolerance for wick noise).
- **Best-fit refinement**: after seeding a line through two pivots, all pivots
  near the line are re-fit with least squares; the fit is only accepted if it
  still respects the no-violation rule.
- **Breakouts**: first candle that closes decisively through the line
  (>= 0.1% beyond) with either volume >= 1.3x trailing avg or a confirmed
  retest within ~10 bars.

## Install

```bash
pip install -r requirements.txt
```

## Usage

```bash
python -m hyperliquid_trendlines BTC --interval 1h --lookback 500
python -m hyperliquid_trendlines ETH-USD --interval 4h --lookback 300 --show
python -m hyperliquid_trendlines SOL --interval 15m --out sol.png
```

Pair input is forgiving: `BTC`, `BTC-USD`, `btc/usdt`, `ETHPERP` all map to the
Hyperliquid perp coin symbol.

### Tuning knobs

| Flag | Default | Notes |
|---|---|---|
| `--left` / `--right` | 3 / 3 | Pivot window; bigger = fewer, stronger pivots |
| `--min-touches` | 3 | Raise to 4+ for stricter lines |
| `--tolerance` | 0.0015 | Fraction of price counted as a "touch" |
| `--volume-multiplier` | 1.3 | Volume threshold for a valid breakout |

## Programmatic use

```python
from hyperliquid_trendlines import fetch_candles, detect_trendlines, detect_breakouts, plot_chart

df = fetch_candles("BTC", interval="1h", lookback=400)
lines = detect_trendlines(df)
breakouts = detect_breakouts(df, lines)
plot_chart(df, lines, breakouts, out_path="btc.png")
```

## Output

- Green lines: ascending support drawn through pivot lows.
- Red lines: descending resistance drawn through pivot highs.
- Green up-triangles: bullish breakout candles.
- Red down-triangles: bearish breakdown candles.
- CLI prints touches, slope, R^2 and breakout details for each line.
