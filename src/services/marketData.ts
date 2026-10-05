import {
  ExchangeId,
  ExchangeHealthStatus,
  KlineCandle,
  SymbolInfo,
  Timeframe,
} from '../types/scanner';
import { executeMarketRequest } from './marketConnection';

// Timeframe mappings for each exchange
export const BYBIT_INTERVAL_MAP: Record<Timeframe, string> = {
  '4H': '240',
  '6H': '360',
  '1D': 'D',
  '3D': '3D',
  '1W': 'W',
  '1M': 'M',
};

export const BINANCE_INTERVAL_MAP: Record<Timeframe, string> = {
  '4H': '4h',
  '6H': '6h',
  '1D': '1d',
  '3D': '3d',
  '1W': '1w',
  '1M': '1M',
};

export const OKX_INTERVAL_MAP: Record<Timeframe, string> = {
  '4H': '4H',
  '6H': '6H',
  '1D': '1D',
  '3D': '3D',
  '1W': '1W',
  '1M': '1M',
};

// Endpoints with built-in mirrors
const BYBIT_BASE = 'https://api.bybit.com';
const BINANCE_BASE = 'https://fapi.binance.com';
const OKX_BASE = 'https://www.okx.com';

/**
 * Fetch all active USDT Perpetual / Futures symbols across selected exchanges.
 * If one exchange fails (e.g. Connection reset or regional ISP block), other exchanges CONTINUE.
 */
export async function fetchAllActiveSymbols(
  selectedExchanges: ExchangeId[] = ['bybit', 'binance', 'okx'],
  onExchangeStatus?: (status: ExchangeHealthStatus) => void
): Promise<{ symbols: SymbolInfo[]; errors: Record<string, string> }> {
  const allSymbols: SymbolInfo[] = [];
  const errors: Record<string, string> = {};

  const tasks = selectedExchanges.map(async (exchange) => {
    try {
      if (onExchangeStatus) {
        onExchangeStatus({
          exchange,
          name: getExchangeDisplayName(exchange),
          status: 'connecting',
          symbolCount: 0,
        });
      }

      let symbols: SymbolInfo[] = [];
      if (exchange === 'bybit') {
        symbols = await fetchBybitSymbols();
      } else if (exchange === 'binance') {
        symbols = await fetchBinanceSymbols();
      } else if (exchange === 'okx') {
        symbols = await fetchOkxSymbols();
      }

      allSymbols.push(...symbols);

      if (onExchangeStatus) {
        onExchangeStatus({
          exchange,
          name: getExchangeDisplayName(exchange),
          status: 'online',
          symbolCount: symbols.length,
        });
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      errors[exchange] = errMsg;
      console.error(`Failed to fetch symbols from ${exchange}:`, errMsg);

      if (onExchangeStatus) {
        onExchangeStatus({
          exchange,
          name: getExchangeDisplayName(exchange),
          status: 'error',
          symbolCount: 0,
          error: errMsg,
        });
      }
    }
  });

  await Promise.allSettled(tasks);

  // Sort all symbols by 24h volume descending
  allSymbols.sort((a, b) => b.volume24hUsd - a.volume24hUsd);

  return { symbols: allSymbols, errors };
}

/**
 * Fetch Bybit Linear USDT Perpetual symbols
 */
async function fetchBybitSymbols(): Promise<SymbolInfo[]> {
  const url = `${BYBIT_BASE}/v5/market/tickers?category=linear`;
  const res = await executeMarketRequest(url, { exchange: 'bybit' });

  if (!res.text) throw new Error('Bybit: Boş yanıt alındı');
  let json: any;
  try {
    json = JSON.parse(res.text);
  } catch {
    throw new Error(`Bybit: Geçersiz veri formatı (${res.text.slice(0, 60)})`);
  }

  if (json.retCode !== 0 && json.retCode !== '0') {
    throw new Error(`Bybit API hatası: ${json.retMsg || json.retCode}`);
  }

  const list: any[] = json.result?.list || [];
  const symbols: SymbolInfo[] = [];

  for (const item of list) {
    if (typeof item.symbol === 'string' && item.symbol.endsWith('USDT')) {
      const lastPrice = parseFloat(item.lastPrice) || 0;
      const change24h = (parseFloat(item.price24hPcnt) || 0) * 100;
      const volume24hUsd = parseFloat(item.turnover24h) || 0;

      symbols.push({
        symbol: item.symbol,
        baseCoin: item.symbol.replace('USDT', ''),
        lastPrice,
        change24h,
        volume24hUsd,
        exchange: 'bybit',
      });
    }
  }

  if (symbols.length === 0) {
    throw new Error('Bybit: Hiçbir USDT çifti bulunamadı.');
  }

  return symbols;
}

/**
 * Fetch Binance USDT-M Futures symbols
 */
async function fetchBinanceSymbols(): Promise<SymbolInfo[]> {
  const url = `${BINANCE_BASE}/fapi/v1/ticker/24hr`;
  const res = await executeMarketRequest(url, { exchange: 'binance' });

  if (!res.text) throw new Error('Binance: Boş yanıt alındı');
  let list: any;
  try {
    list = JSON.parse(res.text);
  } catch {
    throw new Error(`Binance: Geçersiz veri formatı (${res.text.slice(0, 60)})`);
  }

  if (!Array.isArray(list)) {
    throw new Error(`Binance API hatası: ${list.msg || 'Bilinmeyen yanıt'}`);
  }

  const symbols: SymbolInfo[] = [];

  for (const item of list) {
    if (typeof item.symbol === 'string' && item.symbol.endsWith('USDT')) {
      const lastPrice = parseFloat(item.lastPrice) || 0;
      const change24h = parseFloat(item.priceChangePercent) || 0;
      const volume24hUsd = parseFloat(item.quoteVolume) || 0;

      symbols.push({
        symbol: item.symbol,
        baseCoin: item.symbol.replace('USDT', ''),
        lastPrice,
        change24h,
        volume24hUsd,
        exchange: 'binance',
      });
    }
  }

  if (symbols.length === 0) {
    throw new Error('Binance: Hiçbir USDT çifti bulunamadı.');
  }

  return symbols;
}

/**
 * Fetch OKX USDT Perpetual Swap symbols
 */
async function fetchOkxSymbols(): Promise<SymbolInfo[]> {
  const url = `${OKX_BASE}/api/v5/market/tickers?instType=SWAP`;
  const res = await executeMarketRequest(url, { exchange: 'okx' });

  if (!res.text) throw new Error('OKX: Boş yanıt alındı');
  let json: any;
  try {
    json = JSON.parse(res.text);
  } catch {
    throw new Error(`OKX: Geçersiz veri formatı (${res.text.slice(0, 60)})`);
  }

  if (json.code !== '0' && json.code !== 0) {
    throw new Error(`OKX API hatası: ${json.msg || json.code}`);
  }

  const list: any[] = json.data || [];
  const symbols: SymbolInfo[] = [];

  for (const item of list) {
    if (typeof item.instId === 'string' && item.instId.endsWith('-USDT-SWAP')) {
      const lastPrice = parseFloat(item.last) || 0;
      const sodUtc0 = parseFloat(item.sodUtc0) || lastPrice;
      const change24h = sodUtc0 > 0 ? ((lastPrice - sodUtc0) / sodUtc0) * 100 : 0;
      const volume24hUsd = parseFloat(item.volCcy24h) || 0;

      symbols.push({
        symbol: item.instId,
        baseCoin: item.instId.replace('-USDT-SWAP', ''),
        lastPrice,
        change24h,
        volume24hUsd,
        exchange: 'okx',
      });
    }
  }

  if (symbols.length === 0) {
    throw new Error('OKX: Hiçbir USDT Swap çifti bulunamadı.');
  }

  return symbols;
}

/**
 * Fetch candlestick klines for any exchange symbol and timeframe.
 */
export async function fetchExchangeKlines(
  symbol: string,
  timeframe: Timeframe,
  exchange: ExchangeId = 'bybit',
  limit: number = 200
): Promise<KlineCandle[]> {
  if (exchange === 'bybit') {
    return fetchBybitKlines(symbol, timeframe, limit);
  } else if (exchange === 'binance') {
    return fetchBinanceKlines(symbol, timeframe, limit);
  } else if (exchange === 'okx') {
    return fetchOkxKlines(symbol, timeframe, limit);
  }
  return [];
}

async function fetchBybitKlines(
  symbol: string,
  timeframe: Timeframe,
  limit: number = 200
): Promise<KlineCandle[]> {
  const interval = BYBIT_INTERVAL_MAP[timeframe];
  const url = `${BYBIT_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await executeMarketRequest(url, { exchange: 'bybit' });

  if (!res.text) return [];
  let json: any;
  try {
    json = JSON.parse(res.text);
  } catch {
    return [];
  }

  const rawList: string[][] = json.result?.list || [];
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return [];
  }

  // Bybit returns newest first; reverse to chronological order
  const list = rawList.slice().reverse();

  return list.map((item) => {
    const rawTime = parseInt(item[0], 10);
    return {
      time: Math.floor(rawTime / 1000),
      rawTime,
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
    };
  });
}

async function fetchBinanceKlines(
  symbol: string,
  timeframe: Timeframe,
  limit: number = 200
): Promise<KlineCandle[]> {
  const interval = BINANCE_INTERVAL_MAP[timeframe];
  const url = `${BINANCE_BASE}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await executeMarketRequest(url, { exchange: 'binance' });

  if (!res.text) return [];
  let list: any;
  try {
    list = JSON.parse(res.text);
  } catch {
    return [];
  }

  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  // Binance returns oldest first (already chronological)
  return list.map((item) => {
    const rawTime = typeof item[0] === 'number' ? item[0] : parseInt(item[0], 10);
    return {
      time: Math.floor(rawTime / 1000),
      rawTime,
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
    };
  });
}

async function fetchOkxKlines(
  symbol: string,
  timeframe: Timeframe,
  limit: number = 200
): Promise<KlineCandle[]> {
  const bar = OKX_INTERVAL_MAP[timeframe];
  const url = `${OKX_BASE}/api/v5/market/candles?instId=${symbol}&bar=${bar}&limit=${limit}`;
  const res = await executeMarketRequest(url, { exchange: 'okx' });

  if (!res.text) return [];
  let json: any;
  try {
    json = JSON.parse(res.text);
  } catch {
    return [];
  }

  const rawList: string[][] = json.data || [];
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return [];
  }

  // OKX returns newest first; reverse to chronological order
  const list = rawList.slice().reverse();

  return list.map((item) => {
    const rawTime = parseInt(item[0], 10);
    return {
      time: Math.floor(rawTime / 1000),
      rawTime,
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
    };
  });
}

export function getExchangeDisplayName(exchange: ExchangeId): string {
  switch (exchange) {
    case 'bybit':
      return 'Bybit';
    case 'binance':
      return 'Binance';
    case 'okx':
      return 'OKX';
    default:
      return exchange;
  }
}
