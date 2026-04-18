"""Candlestick plotting with trendline and breakout overlays."""
from __future__ import annotations

from typing import Optional, Sequence

import matplotlib.pyplot as plt
import mplfinance as mpf
import numpy as np
import pandas as pd

from .trendlines import Breakout, Trendline


def _line_xy(df: pd.DataFrame, line: Trendline) -> tuple[list[pd.Timestamp], list[float]]:
    n = len(df)
    start = line.start_idx
    end = n - 1
    xs_idx = np.array([start, end], dtype=float)
    ys = line.price_at(xs_idx)
    return [df.index[start], df.index[end]], [float(ys[0]), float(ys[1])]


def plot_chart(
    df: pd.DataFrame,
    lines: Sequence[Trendline],
    breakouts: Sequence[Breakout] = (),
    title: Optional[str] = None,
    out_path: Optional[str] = None,
    show: bool = False,
    style: str = "charles",
):
    """Draw candles with trendlines and breakout markers.

    Saves a PNG to ``out_path`` if given. Returns (fig, axes)."""
    if title is None:
        coin = df.attrs.get("coin", "")
        interval = df.attrs.get("interval", "")
        title = f"{coin} {interval} - Hyperliquid".strip()

    alines = []
    colors = []
    for line in lines:
        xs, ys = _line_xy(df, line)
        alines.append(list(zip(xs, ys)))
        colors.append("tab:red" if line.kind == "resistance" else "tab:green")

    addplots = []
    if breakouts:
        up_series = pd.Series(np.nan, index=df.index)
        dn_series = pd.Series(np.nan, index=df.index)
        for b in breakouts:
            if b.direction == "up":
                up_series.iloc[b.idx] = df["High"].iloc[b.idx] * 1.005
            else:
                dn_series.iloc[b.idx] = df["Low"].iloc[b.idx] * 0.995
        if up_series.notna().any():
            addplots.append(mpf.make_addplot(
                up_series, type="scatter", marker="^", markersize=120, color="lime",
            ))
        if dn_series.notna().any():
            addplots.append(mpf.make_addplot(
                dn_series, type="scatter", marker="v", markersize=120, color="red",
            ))

    kwargs = dict(
        type="candle",
        style=style,
        title=title,
        ylabel="Price",
        volume=True,
        ylabel_lower="Volume",
        alines=dict(alines=alines, colors=colors, linewidths=1.4, alpha=0.85),
        figratio=(16, 9),
        figscale=1.2,
        returnfig=True,
        tight_layout=True,
    )
    if addplots:
        kwargs["addplot"] = addplots

    fig, axes = mpf.plot(df, **kwargs)

    ax = axes[0]
    for line in lines:
        xs, ys = _line_xy(df, line)
        label = (
            f"{line.kind} | touches={line.touches} "
            f"| slope={line.slope:+.4g}"
        )
        try:
            x_last = df.index.get_loc(xs[1])
            ax.annotate(
                label,
                xy=(x_last, ys[1]),
                xytext=(-4, 6 if line.kind == "resistance" else -14),
                textcoords="offset points",
                fontsize=8,
                color="tab:red" if line.kind == "resistance" else "tab:green",
                ha="right",
            )
        except KeyError:
            pass

    if out_path:
        fig.savefig(out_path, dpi=150, bbox_inches="tight")
    if show:
        plt.show()
    else:
        plt.close(fig)
    return fig, axes
