"use client";

import { INTERVALS, type Interval } from "@/lib/hyperliquid";

interface Props {
  pair: string;
  interval: Interval;
  lookback: number;
  loading: boolean;
  onPair: (v: string) => void;
  onInterval: (v: Interval) => void;
  onLookback: (v: number) => void;
  onSubmit: () => void;
}

const COMMON_PAIRS = ["BTC", "ETH", "SOL", "HYPE", "AVAX", "DOGE", "SUI", "ARB", "OP", "LINK"];

export default function Controls({
  pair, interval, lookback, loading,
  onPair, onInterval, onLookback, onSubmit,
}: Props) {
  return (
    <form
      className="controls"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
    >
      <div className="field" style={{ flex: "1 1 160px" }}>
        <label htmlFor="pair">Pair</label>
        <input
          id="pair"
          list="common-pairs"
          value={pair}
          onChange={(e) => onPair(e.target.value)}
          placeholder="BTC"
          autoComplete="off"
          spellCheck={false}
        />
        <datalist id="common-pairs">
          {COMMON_PAIRS.map((p) => <option key={p} value={p} />)}
        </datalist>
      </div>

      <div className="field">
        <label htmlFor="interval">Timeframe</label>
        <select
          id="interval"
          value={interval}
          onChange={(e) => onInterval(e.target.value as Interval)}
        >
          {INTERVALS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="lookback">Candles</label>
        <select
          id="lookback"
          value={lookback}
          onChange={(e) => onLookback(parseInt(e.target.value, 10))}
        >
          {[100, 200, 400, 600, 1000, 1500].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <button type="submit" className="primary" disabled={loading || !pair.trim()}>
        {loading ? "Loading..." : "Load chart"}
      </button>
    </form>
  );
}
