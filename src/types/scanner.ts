export type Timeframe = '4H' | '6H' | '1D' | '3D' | '1W' | '1M';

export type ExchangeId = 'bybit' | 'binance' | 'okx';

export interface KlineCandle {
  time: number; // Unix timestamp in seconds
  rawTime: number; // Unix timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolInfo {
  symbol: string;
  baseCoin: string;
  lastPrice: number;
  change24h: number;
  volume24hUsd: number;
  exchange: ExchangeId;
}

export interface BybitTicker {
  symbol: string;
  lastPrice: string;
  price24hPcnt: string;
  turnover24h: string;
  volume24h: string;
  highPrice24h: string;
  lowPrice24h: string;
}

export interface TrendTouch {
  index: number;
  time: number; // seconds
  dateStr: string;
  price: number;
  candleHigh: number;
  rejectionPct?: number; // Downward rejection percentage following the touch
}

export type BreakoutSignalType =
  | '🔥 MAJÖR DÜŞEN TREND KIRILDI'
  | '🔥 HACİMLİ MAJÖR KIRILIM'
  | '✅ RETEST ONAYLI MAJÖR KIRILIM';

export interface FibLevels {
  fib0382: number;
  fib0500: number;
  fib0618: number;
  fib0786: number;
  fib1000: number;
  swingHigh: number;
  swingLow: number;
}

export interface MajorBreakoutSignal {
  symbol: string;
  exchange: ExchangeId;
  timeframe: Timeframe;
  signalName: BreakoutSignalType;
  signalType: BreakoutSignalType;
  trendAgeDays: number; // Trend Yaşı (Gün)
  trendAgeBars: number; // Trend Yaşı (Bar)
  majorTouchCount: number; // Majör Temas Sayısı (minimum 3)
  breakoutPrice: number; // Kırılım Fiyatı
  currentPrice: number; // Anlık Canlı Fiyat
  tp1: number; // Take Profit 1 (Fibonacci + HTF direnç confluence)
  tp2: number; // Take Profit 2 (Üst majör hedef)
  sl: number; // Stop Loss (Yapısal invalidation seviyesi)
  tp1Ratio: number; // TP1 Risk / Reward
  tp2Ratio: number; // TP2 Risk / Reward
  breakoutTime: number; // Kırılım Zamanı
  breakoutTimeStr: string; // Kırılım Zamanı formatlı
  trendlinePriceAtBreakout: number;
  startPrice: number;
  startDateStr: string;
  touches: TrendTouch[];
  klines: KlineCandle[];
  lineFormula: (barIndex: number) => number;
  volume24hUsd: number;
  change24h: number;
  volumeRatio?: number;
  isHighVolume?: boolean;
  isRetest?: boolean;
  uniqueId: string;
  fibLevels?: FibLevels;
}

export interface ScanFilterOptions {
  timeframes: Timeframe[];
  minTouches: number; // 3+
  searchQuery: string;
  exchanges: ExchangeId[];
}

export interface ExchangeHealthStatus {
  exchange: ExchangeId;
  name: string;
  status: 'online' | 'offline' | 'error' | 'connecting';
  symbolCount: number;
  error?: string;
  lastUsedUrl?: string;
}

export interface ScanProgress {
  isScanning: boolean;
  isPaused: boolean;
  totalSymbols: number;
  scannedSymbols: number;
  currentSymbol: string;
  matchesCount: number;
  speed: number;
  startedAt?: number;
  exchangeErrors?: Record<string, string>;
  activeExchanges?: ExchangeId[];
}
