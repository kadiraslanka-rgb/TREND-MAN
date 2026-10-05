import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ExchangeId, MajorBreakoutSignal, SymbolInfo, Timeframe } from '../types/scanner';
import { runWithConcurrency } from './bybit';
import { fetchAllActiveSymbols, fetchExchangeKlines } from './marketData';
import { detectMajorBreakout } from './trend';
import { isSignalAlreadyNotified, sendBreakoutNotification } from './notificationService';

export type BackgroundScanCallback = (signal: MajorBreakoutSignal) => void;

class BackgroundScannerService {
  private timerId: any = null;
  private isRunning: boolean = false;
  private isScanningNow: boolean = false;
  private isPausedForManualScan: boolean = false;
  private activeTimeframes: Timeframe[] = ['1D', '4H'];
  private activeExchanges: ExchangeId[] = ['bybit', 'binance', 'okx'];
  private onSignalFoundCallbacks: Set<BackgroundScanCallback> = new Set();
  private scanIntervalMinutes: number = 3; // every 3 minutes

  constructor() {
    this.setupAppLifecycleListeners();
  }

  private setupAppLifecycleListeners() {
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', (state) => {
        if (!state.isActive) {
          // App went into background: ensure scanner continues operating
          if (this.isRunning) {
            this.ensureTimerRunning();
          }
        } else {
          // App returned to foreground: trigger a check if not in manual scan
          if (this.isRunning && !this.isPausedForManualScan) {
            this.executeScanCycle();
          }
        }
      });
    }
  }

  public setTimeframes(tfs: Timeframe[]) {
    this.activeTimeframes = tfs;
  }

  public setExchanges(exs: ExchangeId[]) {
    this.activeExchanges = exs;
  }

  public setPausedForManualScan(paused: boolean) {
    this.isPausedForManualScan = paused;
  }

  public onSignal(cb: BackgroundScanCallback) {
    this.onSignalFoundCallbacks.add(cb);
    return () => {
      this.onSignalFoundCallbacks.delete(cb);
    };
  }

  public start(timeframes?: Timeframe[], exchanges?: ExchangeId[], runImmediate: boolean = false) {
    if (timeframes) {
      this.activeTimeframes = timeframes;
    }
    if (exchanges) {
      this.activeExchanges = exchanges;
    }
    this.isRunning = true;
    this.ensureTimerRunning();
    if (runImmediate) {
      this.executeScanCycle();
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public isEnabled(): boolean {
    return this.isRunning;
  }

  private ensureTimerRunning() {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
    const intervalMs = this.scanIntervalMinutes * 60 * 1000;
    this.timerId = setInterval(() => {
      if (this.isRunning && !this.isPausedForManualScan) {
        this.executeScanCycle();
      }
    }, intervalMs);
  }

  /**
   * Execute full background scan across active exchanges
   */
  public async executeScanCycle(): Promise<MajorBreakoutSignal[]> {
    if (this.isScanningNow || this.isPausedForManualScan || !this.isRunning) return [];
    this.isScanningNow = true;

    const newBreakouts: MajorBreakoutSignal[] = [];

    try {
      const { symbols } = await fetchAllActiveSymbols(this.activeExchanges);
      if (!symbols || symbols.length === 0) return [];

      const queue: Array<{ symbolInfo: SymbolInfo; tf: Timeframe }> = [];
      for (const sym of symbols) {
        for (const tf of this.activeTimeframes) {
          queue.push({ symbolInfo: sym, tf });
        }
      }

      await runWithConcurrency(
        queue,
        async (item) => {
          if (!this.isRunning) return null;
          const { symbolInfo, tf } = item;
          const candles = await fetchExchangeKlines(symbolInfo.symbol, tf, symbolInfo.exchange, 200);
          if (!candles || candles.length < 40) return null;

          const signal = detectMajorBreakout(
            candles,
            symbolInfo.symbol,
            tf,
            symbolInfo.volume24hUsd,
            symbolInfo.change24h,
            symbolInfo.exchange
          );

          if (signal) {
            newBreakouts.push(signal);

            // Notify each listener
            this.onSignalFoundCallbacks.forEach((cb) => cb(signal));

            // Send notification only if not already sent for this exact breakout
            if (!isSignalAlreadyNotified(signal)) {
              await sendBreakoutNotification(signal);
            }
          }
          return signal;
        },
        8 // Safe concurrency
      );
    } catch (err) {
      console.error('Background scanner error:', err);
    } finally {
      this.isScanningNow = false;
    }

    return newBreakouts;
  }
}

export const backgroundScanner = new BackgroundScannerService();
