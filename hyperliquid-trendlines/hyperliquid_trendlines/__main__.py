"""CLI: python -m hyperliquid_trendlines BTC --interval 1h --lookback 400"""
from __future__ import annotations

import argparse
import sys

from .fetch import VALID_INTERVALS, fetch_candles
from .plot import plot_chart
from .trendlines import detect_breakouts, detect_trendlines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Plot Hyperliquid perp candles with trendlines and breakout signals.",
    )
    parser.add_argument("pair", help="Hyperliquid perp symbol, e.g. BTC, ETH, SOL, BTC-USD")
    parser.add_argument("--interval", default="1h",
                        help=f"Candle interval. One of: {sorted(VALID_INTERVALS)}")
    parser.add_argument("--lookback", type=int, default=400,
                        help="Number of candles to fetch (default 400)")
    parser.add_argument("--left", type=int, default=3,
                        help="Left bars for pivot detection")
    parser.add_argument("--right", type=int, default=3,
                        help="Right bars for pivot detection")
    parser.add_argument("--min-touches", type=int, default=3,
                        help="Minimum touches for a trendline to be kept")
    parser.add_argument("--tolerance", type=float, default=0.0015,
                        help="Touch tolerance as fraction of price (default 0.0015 = 0.15%%)")
    parser.add_argument("--volume-multiplier", type=float, default=1.3,
                        help="Min volume / rolling avg for a valid breakout")
    parser.add_argument("--out", default=None, help="Output PNG path")
    parser.add_argument("--show", action="store_true", help="Display chart window")
    args = parser.parse_args(argv)

    try:
        df = fetch_candles(args.pair, interval=args.interval, lookback=args.lookback)
    except Exception as exc:
        print(f"Error fetching candles: {exc}", file=sys.stderr)
        return 2

    if len(df) < args.left + args.right + 5:
        print("Not enough candles returned to detect pivots.", file=sys.stderr)
        return 3

    lines = detect_trendlines(
        df,
        left=args.left,
        right=args.right,
        min_touches=args.min_touches,
        tol_pct=args.tolerance,
    )
    breakouts = detect_breakouts(
        df, lines, volume_multiplier=args.volume_multiplier,
    )

    coin = df.attrs.get("coin", args.pair)
    print(f"{coin} {args.interval}: {len(df)} candles, "
          f"{len(lines)} trendlines, {len(breakouts)} breakouts")
    for line in lines:
        print(f"  {line.kind:10s} touches={line.touches} "
              f"slope={line.slope:+.4g} r2={line.r_squared:.3f} "
              f"pivots={line.pivots}")
    for b in breakouts:
        print(f"  breakout {b.direction:4s} @ {b.timestamp}  "
              f"price={b.price:.4g}  vol_ratio={b.volume_ratio:.2f}  "
              f"retest={b.retest}  ({b.line.kind})")

    out_path = args.out or f"{coin}_{args.interval}_trendlines.png"
    plot_chart(df, lines, breakouts, out_path=out_path, show=args.show)
    print(f"Saved chart to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
