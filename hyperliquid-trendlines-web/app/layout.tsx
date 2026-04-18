import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hyperliquid Trendlines",
  description: "Auto-drawn trendlines and breakout signals on Hyperliquid perp candles.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
