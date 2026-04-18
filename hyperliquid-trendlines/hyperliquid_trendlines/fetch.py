"""Hyperliquid public-API candle fetcher.

Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
Endpoint accepts POST JSON of the form:
    {"type": "candleSnapshot",
     "req": {"coin": "BTC", "interval": "1h",
             "startTime": <ms>, "endTime": <ms>}}
"""
from __future__ import annotations

import time
from typing import Optional

import pandas as pd
import requests

HL_INFO_URL = "https://api.hyperliquid.xyz/info"

VALID_INTERVALS = {
    "1m", "3m", "5m", "15m", "30m",
    "1h", "2h", "4h", "8h", "12h",
    "1d", "3d", "1w", "1M",
}

_INTERVAL_MS = {
    "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
    "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000, "8h": 28_800_000,
    "12h": 43_200_000, "1d": 86_400_000, "3d": 259_200_000, "1w": 604_800_000,
    "1M": 2_592_000_000,
}


def _normalize_coin(pair: str) -> str:
    """Accept "BTC", "BTC-USD", "BTCUSD", "btc/usdt" etc. Hyperliquid perps use
    the bare coin symbol (e.g. "BTC", "ETH", "SOL")."""
    p = pair.upper().replace(" ", "")
    for sep in ("-", "/", ":"):
        if sep in p:
            p = p.split(sep, 1)[0]
    for suffix in ("USDT", "USDC", "USD", "PERP"):
        if p.endswith(suffix) and len(p) > len(suffix):
            p = p[: -len(suffix)]
    return p


def fetch_candles(
    pair: str,
    interval: str = "1h",
    lookback: int = 500,
    end_time_ms: Optional[int] = None,
    timeout: float = 10.0,
) -> pd.DataFrame:
    """Fetch OHLCV candles for a Hyperliquid perp pair.

    Returns a DataFrame indexed by UTC timestamp with columns
    Open, High, Low, Close, Volume.
    """
    if interval not in VALID_INTERVALS:
        raise ValueError(f"interval must be one of {sorted(VALID_INTERVALS)}")

    coin = _normalize_coin(pair)
    step_ms = _INTERVAL_MS[interval]
    end_ms = end_time_ms if end_time_ms is not None else int(time.time() * 1000)
    start_ms = end_ms - step_ms * lookback

    payload = {
        "type": "candleSnapshot",
        "req": {
            "coin": coin,
            "interval": interval,
            "startTime": start_ms,
            "endTime": end_ms,
        },
    }
    resp = requests.post(HL_INFO_URL, json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()

    if not isinstance(data, list) or not data:
        raise RuntimeError(
            f"No candles returned for coin={coin!r}. "
            f"Is it a valid Hyperliquid perp symbol?"
        )

    df = pd.DataFrame(data)
    df = df.rename(
        columns={"t": "open_time", "T": "close_time",
                 "o": "Open", "h": "High", "l": "Low", "c": "Close", "v": "Volume"}
    )
    for c in ("Open", "High", "Low", "Close", "Volume"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["Date"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    df = df.set_index("Date").sort_index()
    df.attrs["coin"] = coin
    df.attrs["interval"] = interval
    return df[["Open", "High", "Low", "Close", "Volume"]]
