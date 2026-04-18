"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import Controls from "@/components/Controls";
import type { Candle, Interval } from "@/lib/hyperliquid";
import type { Breakout, Trendline } from "@/lib/trendlines";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

interface ApiResponse {
  pair: string;
  interval: Interval;
  candles: Candle[];
  lines: Trendline[];
  breakouts: Breakout[];
}

export default function Page() {
  const [pair, setPair] = useState("BTC");
  const [interval, setInterval] = useState<Interval>("1h");
  const [lookback, setLookback] = useState(400);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pair, interval, lookback: String(lookback) });
      const res = await fetch(`/api/candles?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [pair, interval, lookback]);

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container">
      <h1>Hyperliquid Trendlines</h1>
      <p className="subtitle">
        Auto-drawn angled trendlines and breakout signals for Hyperliquid perp candles.
        Support lines through pivot lows, resistance through pivot highs, 3+ touches required.
      </p>

      <Controls
        pair={pair}
        interval={interval}
        lookback={lookback}
        loading={loading}
        onPair={setPair}
        onInterval={setInterval}
        onLookback={setLookback}
        onSubmit={load}
      />

      {error && <div className="error">Error: {error}</div>}

      <div className="chart-wrap">
        {data ? (
          <Chart candles={data.candles} lines={data.lines} breakouts={data.breakouts} />
        ) : (
          <div className="chart" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#8b95a1" }}>
            {loading ? "Loading candles..." : "Enter a pair and timeframe to begin."}
          </div>
        )}
      </div>

      {data && (
        <>
          <div className="status-bar">
            <span className="pill">{data.pair} {data.interval}</span>
            <span>{data.candles.length} candles</span>
            <span>{data.lines.length} trendlines</span>
            <span>{data.breakouts.length} breakouts</span>
          </div>

          <div className="legend">
            <span><span className="swatch" style={{ background: "#4ade80" }} /> support (pivot lows)</span>
            <span><span className="swatch" style={{ background: "#f87171" }} /> resistance (pivot highs)</span>
            <span>▲ bullish break &nbsp; ▼ bearish break</span>
          </div>

          {data.breakouts.length > 0 && (
            <div className="breakouts">
              <h3>Breakouts</h3>
              <ul>
                {data.breakouts.map((b, i) => (
                  <li key={i}>
                    <span className={b.direction === "up" ? "dir-up" : "dir-down"}>
                      {b.direction === "up" ? "▲ Bullish break" : "▼ Bearish break"}
                    </span>
                    <small>
                      {new Date(b.time * 1000).toUTCString()}<br />
                      price {b.price.toFixed(4)} &middot; vol {b.volumeRatio.toFixed(2)}x
                      {b.retest && " \u00b7 retest confirmed"}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
