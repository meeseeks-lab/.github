"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  LineStyle,
  UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/hyperliquid";
import type { Breakout, Trendline } from "@/lib/trendlines";
import { priceAt } from "@/lib/trendlines";

interface Props {
  candles: Candle[];
  lines: Trendline[];
  breakouts: Breakout[];
}

export default function Chart({ candles, lines, breakouts }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const trendSeriesRef = useRef<ISeriesApi<"Line">[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#121826" },
        textColor: "#c9d1d9",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "#1f2a3a" },
        horzLines: { color: "#1f2a3a" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#26324a" },
      timeScale: { borderColor: "#26324a", timeVisible: true, secondsVisible: false },
      autoSize: true,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      color: "#334155",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const ro = new ResizeObserver(() => chart.timeScale().fitContent());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      trendSeriesRef.current = [];
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!chart || !candleSeries || !volumeSeries) return;

    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open, high: c.high, low: c.low, close: c.close,
      })),
    );
    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
      })),
    );

    for (const s of trendSeriesRef.current) chart.removeSeries(s);
    trendSeriesRef.current = [];

    for (const line of lines) {
      const ls = chart.addLineSeries({
        color: line.kind === "resistance" ? "#f87171" : "#4ade80",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const data = [];
      for (let i = line.startIdx; i < candles.length; i++) {
        data.push({ time: candles[i].time as UTCTimestamp, value: priceAt(line, i) });
      }
      ls.setData(data);
      trendSeriesRef.current.push(ls);
    }

    const markers = breakouts.map((b) => ({
      time: b.time as UTCTimestamp,
      position: (b.direction === "up" ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
      color: b.direction === "up" ? "#22c55e" : "#ef4444",
      shape: (b.direction === "up" ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown",
      text: `${b.direction.toUpperCase()} ${b.volumeRatio.toFixed(2)}x${b.retest ? " + retest" : ""}`,
    }));
    candleSeries.setMarkers(markers);

    chart.timeScale().fitContent();
  }, [candles, lines, breakouts]);

  return <div ref={containerRef} className="chart" />;
}
