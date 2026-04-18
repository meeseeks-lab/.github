"""Trendline detection tuned to the breakout playbook from the research notes:

- Draw ascending lines along swing lows, descending lines along swing highs.
- Require >=3 touches to treat a line as valid.
- Reject lines that violate the price series (line crosses into candles).
- Prefer shallower slopes; flag lines steeper than ~60deg in log-price space.
- A breakout is a decisive close through the line, ideally with volume >=
  ~1.3x the trailing average.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Literal, Sequence

import math
import numpy as np
import pandas as pd


Kind = Literal["support", "resistance"]


@dataclass
class Trendline:
    kind: Kind
    slope: float                 # price per bar
    intercept: float             # price at bar index 0
    start_idx: int               # first pivot index
    end_idx: int                 # last pivot index used to fit
    pivots: List[int] = field(default_factory=list)
    touches: int = 0
    r_squared: float = 0.0

    def price_at(self, idx: int | np.ndarray) -> float | np.ndarray:
        return self.slope * np.asarray(idx) + self.intercept

    def angle_degrees(self, bar_span_price: float) -> float:
        """Angle in degrees after normalising bars and price to a common scale.
        ``bar_span_price`` is the typical price change per bar (e.g. ATR) used
        to make the angle meaningful instead of axis-dependent."""
        if bar_span_price <= 0:
            return 0.0
        return math.degrees(math.atan(self.slope / bar_span_price))


@dataclass
class Breakout:
    idx: int
    timestamp: pd.Timestamp
    price: float
    line: Trendline
    direction: Literal["up", "down"]
    volume_ratio: float
    retest: bool = False


def find_pivots(
    highs: Sequence[float],
    lows: Sequence[float],
    left: int = 3,
    right: int = 3,
) -> tuple[list[int], list[int]]:
    """Classical fractal pivots: a bar is a pivot high if its high is the max
    over [i-left, i+right], and similarly for pivot lows."""
    highs = np.asarray(highs, dtype=float)
    lows = np.asarray(lows, dtype=float)
    n = len(highs)
    pivot_highs: list[int] = []
    pivot_lows: list[int] = []
    for i in range(left, n - right):
        window_h = highs[i - left : i + right + 1]
        window_l = lows[i - left : i + right + 1]
        if highs[i] == window_h.max() and (window_h == highs[i]).sum() == 1:
            pivot_highs.append(i)
        if lows[i] == window_l.min() and (window_l == lows[i]).sum() == 1:
            pivot_lows.append(i)
    return pivot_highs, pivot_lows


def _fit_line(xs: np.ndarray, ys: np.ndarray) -> tuple[float, float, float]:
    """Least-squares line. Returns slope, intercept, r^2."""
    if len(xs) < 2:
        return 0.0, float(ys[0]) if len(ys) else 0.0, 0.0
    slope, intercept = np.polyfit(xs, ys, 1)
    preds = slope * xs + intercept
    ss_res = float(np.sum((ys - preds) ** 2))
    ss_tot = float(np.sum((ys - ys.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0
    return float(slope), float(intercept), r2


def _validate_line(
    slope: float,
    intercept: float,
    series: np.ndarray,
    start: int,
    end: int,
    kind: Kind,
    tol_pct: float = 0.001,
) -> tuple[bool, int]:
    """A support line must sit at-or-below lows; a resistance line at-or-above
    highs, between ``start`` and ``end``. Small tolerance allows wick noise.
    Returns (valid, touch_count) where a touch means the bar came within
    ``tol_pct`` of the line."""
    idxs = np.arange(start, end + 1)
    line_vals = slope * idxs + intercept
    window = series[start : end + 1]
    if kind == "support":
        tolerance = np.abs(line_vals) * tol_pct
        if np.any(window < line_vals - tolerance):
            return False, 0
        touches = int(np.sum(np.abs(window - line_vals) <= tolerance))
    else:
        tolerance = np.abs(line_vals) * tol_pct
        if np.any(window > line_vals + tolerance):
            return False, 0
        touches = int(np.sum(np.abs(window - line_vals) <= tolerance))
    return True, touches


def _best_line_through_pivots(
    pivots: Sequence[int],
    series: np.ndarray,
    kind: Kind,
    min_touches: int = 3,
    tol_pct: float = 0.001,
) -> Trendline | None:
    """Search pairs of pivots, extend the line across the whole window, keep
    the line with the most touches that doesn't violate the price series."""
    pivots = list(pivots)
    if len(pivots) < 2:
        return None

    n = len(series)
    best: Trendline | None = None

    for i in range(len(pivots)):
        for j in range(i + 1, len(pivots)):
            p1, p2 = pivots[i], pivots[j]
            x1, x2 = float(p1), float(p2)
            y1, y2 = float(series[p1]), float(series[p2])
            if x2 == x1:
                continue
            slope = (y2 - y1) / (x2 - x1)
            intercept = y1 - slope * x1

            valid, touches = _validate_line(
                slope, intercept, series, start=p1, end=n - 1,
                kind=kind, tol_pct=tol_pct,
            )
            if not valid or touches < min_touches:
                continue

            involved = [
                p for p in pivots
                if p1 <= p <= n - 1
                and abs(series[p] - (slope * p + intercept)) <= abs(slope * p + intercept) * tol_pct
            ]
            if len(involved) < 2:
                continue

            xs = np.array(involved, dtype=float)
            ys = series[involved]
            fit_slope, fit_intercept, r2 = _fit_line(xs, ys)

            valid2, touches2 = _validate_line(
                fit_slope, fit_intercept, series, start=p1, end=n - 1,
                kind=kind, tol_pct=tol_pct,
            )
            if valid2 and touches2 >= touches:
                slope, intercept, touches = fit_slope, fit_intercept, touches2

            candidate = Trendline(
                kind=kind, slope=slope, intercept=intercept,
                start_idx=min(involved), end_idx=max(involved),
                pivots=sorted(involved), touches=touches, r_squared=r2,
            )
            if best is None or (
                candidate.touches, candidate.r_squared
            ) > (best.touches, best.r_squared):
                best = candidate
    return best


def detect_trendlines(
    df: pd.DataFrame,
    left: int = 3,
    right: int = 3,
    min_touches: int = 3,
    tol_pct: float = 0.0015,
    max_lines_per_side: int = 2,
) -> list[Trendline]:
    """Find the most meaningful support and resistance trendlines on ``df``."""
    highs = df["High"].to_numpy()
    lows = df["Low"].to_numpy()
    pivot_highs, pivot_lows = find_pivots(highs, lows, left=left, right=right)

    lines: list[Trendline] = []

    # Resistance lines along pivot highs.
    res = _best_line_through_pivots(
        pivot_highs, highs, kind="resistance",
        min_touches=min_touches, tol_pct=tol_pct,
    )
    if res is not None:
        lines.append(res)

    # Support lines along pivot lows.
    sup = _best_line_through_pivots(
        pivot_lows, lows, kind="support",
        min_touches=min_touches, tol_pct=tol_pct,
    )
    if sup is not None:
        lines.append(sup)

    # Secondary lines: retry ignoring the pivots already used.
    if max_lines_per_side > 1 and res is not None:
        remaining = [p for p in pivot_highs if p not in res.pivots]
        extra = _best_line_through_pivots(
            remaining, highs, kind="resistance",
            min_touches=min_touches, tol_pct=tol_pct,
        )
        if extra is not None:
            lines.append(extra)

    if max_lines_per_side > 1 and sup is not None:
        remaining = [p for p in pivot_lows if p not in sup.pivots]
        extra = _best_line_through_pivots(
            remaining, lows, kind="support",
            min_touches=min_touches, tol_pct=tol_pct,
        )
        if extra is not None:
            lines.append(extra)

    return lines


def detect_breakouts(
    df: pd.DataFrame,
    lines: Sequence[Trendline],
    volume_window: int = 20,
    volume_multiplier: float = 1.3,
    min_break_pct: float = 0.001,
) -> list[Breakout]:
    """Mark the first decisive close through each line with volume support."""
    closes = df["Close"].to_numpy()
    volumes = df["Volume"].to_numpy()
    avg_vol = pd.Series(volumes).rolling(volume_window, min_periods=1).mean().to_numpy()
    n = len(df)

    breakouts: list[Breakout] = []
    for line in lines:
        for i in range(max(line.end_idx + 1, 1), n):
            level = line.price_at(i)
            if level <= 0 or not np.isfinite(level):
                continue
            close = closes[i]
            vol_ratio = volumes[i] / avg_vol[i] if avg_vol[i] > 0 else 0.0
            breached = abs(close - level) / level >= min_break_pct

            if line.kind == "resistance" and close > level and breached:
                direction = "up"
            elif line.kind == "support" and close < level and breached:
                direction = "down"
            else:
                continue

            retest = False
            for j in range(i + 1, min(i + 10, n)):
                lj = line.price_at(j)
                if direction == "up" and df["Low"].iloc[j] <= lj <= df["High"].iloc[j] and closes[j] > lj:
                    retest = True
                    break
                if direction == "down" and df["Low"].iloc[j] <= lj <= df["High"].iloc[j] and closes[j] < lj:
                    retest = True
                    break

            breakouts.append(
                Breakout(
                    idx=i,
                    timestamp=df.index[i],
                    price=float(close),
                    line=line,
                    direction=direction,
                    volume_ratio=float(vol_ratio),
                    retest=retest,
                )
            )
            break

    breakouts = [b for b in breakouts if b.volume_ratio >= volume_multiplier or b.retest]
    return breakouts
