import type { Candle } from "./hyperliquid";

export type Kind = "support" | "resistance";

export interface Trendline {
  kind: Kind;
  slope: number;       // price per bar (index units)
  intercept: number;   // price at bar 0
  startIdx: number;    // first pivot index used
  endIdx: number;      // last pivot index used
  pivots: number[];
  touches: number;
  rSquared: number;
}

export interface Breakout {
  idx: number;
  time: number;        // unix seconds
  price: number;
  direction: "up" | "down";
  volumeRatio: number;
  retest: boolean;
  line: Trendline;
}

export function priceAt(line: Trendline, idx: number): number {
  return line.slope * idx + line.intercept;
}

export function findPivots(
  highs: number[],
  lows: number[],
  left = 3,
  right = 3,
): { pivotHighs: number[]; pivotLows: number[] } {
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];
  const n = highs.length;
  for (let i = left; i < n - right; i++) {
    let isHigh = true;
    let isLow = true;
    let highMatches = 0;
    let lowMatches = 0;
    for (let k = i - left; k <= i + right; k++) {
      if (highs[k] > highs[i]) isHigh = false;
      if (lows[k] < lows[i]) isLow = false;
      if (highs[k] === highs[i]) highMatches++;
      if (lows[k] === lows[i]) lowMatches++;
    }
    if (isHigh && highMatches === 1) pivotHighs.push(i);
    if (isLow && lowMatches === 1) pivotLows.push(i);
  }
  return { pivotHighs, pivotLows };
}

function fitLine(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]; sumY += ys[i];
    sumXY += xs[i] * ys[i]; sumXX += xs[i] * xs[i];
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  return { slope, intercept, r2 };
}

function validateLine(
  slope: number,
  intercept: number,
  series: number[],
  start: number,
  end: number,
  kind: Kind,
  tolPct: number,
): { valid: boolean; touches: number } {
  let touches = 0;
  for (let i = start; i <= end; i++) {
    const lv = slope * i + intercept;
    const tol = Math.abs(lv) * tolPct;
    if (kind === "support") {
      if (series[i] < lv - tol) return { valid: false, touches: 0 };
    } else {
      if (series[i] > lv + tol) return { valid: false, touches: 0 };
    }
    if (Math.abs(series[i] - lv) <= tol) touches++;
  }
  return { valid: true, touches };
}

function bestLineThroughPivots(
  pivots: number[],
  series: number[],
  kind: Kind,
  minTouches: number,
  tolPct: number,
): Trendline | null {
  if (pivots.length < 2) return null;
  const n = series.length;
  let best: Trendline | null = null;

  for (let i = 0; i < pivots.length; i++) {
    for (let j = i + 1; j < pivots.length; j++) {
      const p1 = pivots[i];
      const p2 = pivots[j];
      const dx = p2 - p1;
      if (dx === 0) continue;
      let slope = (series[p2] - series[p1]) / dx;
      let intercept = series[p1] - slope * p1;

      let check = validateLine(slope, intercept, series, p1, n - 1, kind, tolPct);
      if (!check.valid || check.touches < minTouches) continue;

      const involved: number[] = [];
      for (const p of pivots) {
        if (p < p1 || p > n - 1) continue;
        const lv = slope * p + intercept;
        if (Math.abs(series[p] - lv) <= Math.abs(lv) * tolPct) involved.push(p);
      }
      if (involved.length < 2) continue;

      const xs = involved.map((x) => x);
      const ys = involved.map((p) => series[p]);
      const fit = fitLine(xs, ys);
      const refit = validateLine(fit.slope, fit.intercept, series, p1, n - 1, kind, tolPct);
      if (refit.valid && refit.touches >= check.touches) {
        slope = fit.slope;
        intercept = fit.intercept;
        check = refit;
      }

      const candidate: Trendline = {
        kind,
        slope,
        intercept,
        startIdx: Math.min(...involved),
        endIdx: Math.max(...involved),
        pivots: involved.slice().sort((a, b) => a - b),
        touches: check.touches,
        rSquared: fit.r2,
      };
      if (
        best === null ||
        candidate.touches > best.touches ||
        (candidate.touches === best.touches && candidate.rSquared > best.rSquared)
      ) {
        best = candidate;
      }
    }
  }
  return best;
}

export interface DetectOptions {
  left?: number;
  right?: number;
  minTouches?: number;
  tolPct?: number;
  maxLinesPerSide?: number;
}

export function detectTrendlines(candles: Candle[], opts: DetectOptions = {}): Trendline[] {
  const left = opts.left ?? 3;
  const right = opts.right ?? 3;
  const minTouches = opts.minTouches ?? 3;
  const tolPct = opts.tolPct ?? 0.0015;
  const maxLinesPerSide = opts.maxLinesPerSide ?? 2;

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const { pivotHighs, pivotLows } = findPivots(highs, lows, left, right);

  const lines: Trendline[] = [];

  const res = bestLineThroughPivots(pivotHighs, highs, "resistance", minTouches, tolPct);
  if (res) lines.push(res);
  const sup = bestLineThroughPivots(pivotLows, lows, "support", minTouches, tolPct);
  if (sup) lines.push(sup);

  if (maxLinesPerSide > 1 && res) {
    const rem = pivotHighs.filter((p) => !res.pivots.includes(p));
    const extra = bestLineThroughPivots(rem, highs, "resistance", minTouches, tolPct);
    if (extra) lines.push(extra);
  }
  if (maxLinesPerSide > 1 && sup) {
    const rem = pivotLows.filter((p) => !sup.pivots.includes(p));
    const extra = bestLineThroughPivots(rem, lows, "support", minTouches, tolPct);
    if (extra) lines.push(extra);
  }

  return lines;
}

export interface BreakoutOptions {
  volumeWindow?: number;
  volumeMultiplier?: number;
  minBreakPct?: number;
}

export function detectBreakouts(
  candles: Candle[],
  lines: Trendline[],
  opts: BreakoutOptions = {},
): Breakout[] {
  const volWindow = opts.volumeWindow ?? 20;
  const volMult = opts.volumeMultiplier ?? 1.3;
  const minPct = opts.minBreakPct ?? 0.001;

  const n = candles.length;
  const rollingAvg = new Array<number>(n).fill(0);
  {
    let sum = 0;
    const q: number[] = [];
    for (let i = 0; i < n; i++) {
      q.push(candles[i].volume);
      sum += candles[i].volume;
      if (q.length > volWindow) sum -= q.shift()!;
      rollingAvg[i] = sum / q.length;
    }
  }

  const breakouts: Breakout[] = [];
  for (const line of lines) {
    for (let i = Math.max(line.endIdx + 1, 1); i < n; i++) {
      const lv = priceAt(line, i);
      if (!isFinite(lv) || lv <= 0) continue;
      const c = candles[i];
      const deviation = Math.abs(c.close - lv) / lv;
      if (deviation < minPct) continue;

      let direction: "up" | "down" | null = null;
      if (line.kind === "resistance" && c.close > lv) direction = "up";
      else if (line.kind === "support" && c.close < lv) direction = "down";
      if (!direction) continue;

      let retest = false;
      for (let j = i + 1; j < Math.min(i + 10, n); j++) {
        const lj = priceAt(line, j);
        const cj = candles[j];
        if (cj.low <= lj && lj <= cj.high) {
          if (direction === "up" && cj.close > lj) { retest = true; break; }
          if (direction === "down" && cj.close < lj) { retest = true; break; }
        }
      }

      const volRatio = rollingAvg[i] > 0 ? c.volume / rollingAvg[i] : 0;
      if (volRatio >= volMult || retest) {
        breakouts.push({
          idx: i,
          time: c.time,
          price: c.close,
          direction,
          volumeRatio: volRatio,
          retest,
          line,
        });
      }
      break;
    }
  }
  return breakouts;
}
