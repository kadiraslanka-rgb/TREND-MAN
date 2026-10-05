import { BybitTicker, KlineCandle, SymbolInfo, Timeframe } from '../types/scanner';
import { executeMarketRequest } from './marketConnection';
import { BYBIT_INTERVAL_MAP, fetchExchangeKlines } from './marketData';

export const TIMEFRAME_MAP = BYBIT_INTERVAL_MAP;

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '4H': 4 * 3600,
  '6H': 6 * 3600,
  '1D': 24 * 3600,
  '3D': 3 * 24 * 3600,
  '1W': 7 * 24 * 3600,
  '1M': 30 * 24 * 3600,
};

const BYBIT_BASE = 'https://api.bybit.com';

/**
 * Universal Bybit fetcher using native MarketConnection on Android and mirror failover
 */
async function fetchBybit<T>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${BYBIT_BASE}${path}`;
  const res = await executeMarketRequest(url, { exchange: 'bybit' });

  if (!res.text) {
    throw new Error(`Bybit yanıtı boş (HTTP ${res.status})`);
  }

  return JSON.parse(res.text) as T;
}

/**
 * Fetch all active Bybit USDT Perpetual symbols and metrics
 */
export async function fetchAllActiveUsdtPerpetuals(): Promise<SymbolInfo[]> {
  try {
    const tickersRes = await fetchBybit<{
      retCode: number;
      retMsg?: string;
      result: { list: BybitTicker[] };
    }>('/v5/market/tickers?category=linear');

    const tickerMap = new Map<string, BybitTicker>();
    if (tickersRes?.result?.list) {
      for (const t of tickersRes.result.list) {
        if (t.symbol && t.symbol.endsWith('USDT')) {
          tickerMap.set(t.symbol, t);
        }
      }
    }

    const symbols: SymbolInfo[] = [];

    for (const [symbol, ticker] of tickerMap.entries()) {
      symbols.push({
        symbol,
        baseCoin: symbol.replace('USDT', ''),
        lastPrice: parseFloat(ticker.lastPrice) || 0,
        change24h: (parseFloat(ticker.price24hPcnt) || 0) * 100,
        volume24hUsd: parseFloat(ticker.turnover24h) || 0,
        exchange: 'bybit',
      });
    }

    symbols.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    return symbols;
  } catch (err) {
    console.error('Error fetching Bybit USDT perpetuals:', err);
    throw err;
  }
}

/**
 * Fetch kline candlestick history for a symbol and timeframe
 */
export async function fetchKlines(
  symbol: string,
  timeframe: Timeframe,
  limit: number = 200,
  exchange: 'bybit' | 'binance' | 'okx' = 'bybit'
): Promise<KlineCandle[]> {
  return fetchExchangeKlines(symbol, timeframe, exchange, limit);
}

/**
 * Rate-limited concurrent executor to scan multiple symbols cleanly
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  workerFn: (item: T, index: number) => Promise<R>,
  concurrency: number = 6,
  onProgress?: (completed: number, total: number, lastResult: R | null) => void,
  shouldStop?: () => boolean
): Promise<R[]> {
  const results: R[] = [];
  let currentIndex = 0;
  let completedCount = 0;
  const total = items.length;

  const worker = async () => {
    while (currentIndex < total) {
      if (shouldStop && shouldStop()) {
        break;
      }
      const index = currentIndex++;
      const item = items[index];

      try {
        const res = await workerFn(item, index);
        results.push(res);
        completedCount++;
        if (onProgress) {
          onProgress(completedCount, total, res);
        }
      } catch (err) {
        completedCount++;
        if (onProgress) {
          onProgress(completedCount, total, null);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  };

  const pool = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(pool);

  return results;
}
