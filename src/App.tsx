import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ExchangeHealthStatus,
  ExchangeId,
  MajorBreakoutSignal,
  ScanFilterOptions,
  ScanProgress,
  SymbolInfo,
  Timeframe,
} from './types/scanner';
import { fetchAllActiveSymbols, fetchExchangeKlines, getExchangeDisplayName } from './services/marketData';
import { runWithConcurrency } from './services/bybit';
import { detectMajorBreakout } from './services/trend';
import {
  initNotificationService,
  sendBreakoutNotification,
  NotificationActionPayload,
} from './services/notificationService';
import { backgroundScanner } from './services/backgroundScanner';
import { runDiagnosticReport } from './services/marketConnection';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { TrendCard } from './components/TrendCard';
import { ChartModal } from './components/ChartModal';
import {
  Flame,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Bell,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Play,
  Download,
  Terminal,
  Activity,
  Copy,
} from 'lucide-react';

const AVAILABLE_TIMEFRAMES: Timeframe[] = ['4H', '6H', '1D', '3D', '1W', '1M'];

export default function App() {
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState<boolean>(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [exchangeStatuses, setExchangeStatuses] = useState<Record<string, ExchangeHealthStatus>>({
    bybit: { exchange: 'bybit', name: 'Bybit', status: 'connecting', symbolCount: 0 },
    binance: { exchange: 'binance', name: 'Binance', status: 'connecting', symbolCount: 0 },
    okx: { exchange: 'okx', name: 'OKX', status: 'connecting', symbolCount: 0 },
  });
  const [exchangeErrors, setExchangeErrors] = useState<Record<string, string>>({});
  const [candleErrorNotice, setCandleErrorNotice] = useState<string | null>(null);
  const [diagnosticReport, setDiagnosticReport] = useState<string | null>(null);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState<boolean>(false);
  const [reportCopied, setReportCopied] = useState<boolean>(false);

  // Scanner state
  const [signals, setSignals] = useState<MajorBreakoutSignal[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<MajorBreakoutSignal | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [bgTrackingEnabled, setBgTrackingEnabled] = useState<boolean>(true);
  const [notificationTestSent, setNotificationTestSent] = useState<boolean>(false);

  // Filter state
  const [filters, setFilters] = useState<ScanFilterOptions>({
    timeframes: ['1D'], // default to 1D
    minTouches: 3, // En az 3 majör temas zorunlu
    searchQuery: '',
    exchanges: ['bybit', 'binance', 'okx'],
  });

  // Scan progress state
  const [progress, setProgress] = useState<ScanProgress>({
    isScanning: false,
    isPaused: false,
    totalSymbols: 0,
    scannedSymbols: 0,
    currentSymbol: '',
    matchesCount: 0,
    speed: 0,
  });

  const stopRequestedRef = useRef<boolean>(false);
  const pauseRequestedRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Sound alert
  const playBreakoutAlert = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.25);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(587.33, now);
      osc2.frequency.exponentialRampToValueAtTime(880, now + 0.25);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.35);
    } catch {
      // Audio might be waiting for interaction
    }
  }, [soundEnabled]);

  // Handler when user taps a notification
  const handleOpenFromNotification = useCallback(
    async (payload: NotificationActionPayload) => {
      const existing = signals.find(
        (s) => s.symbol === payload.symbol && s.timeframe === payload.timeframe
      );
      if (existing) {
        setSelectedSignal(existing);
        return;
      }

      try {
        const exchange = (payload as any).exchange || 'bybit';
        const candles = await fetchExchangeKlines(payload.symbol, payload.timeframe as Timeframe, exchange, 200);
        const signal = detectMajorBreakout(candles, payload.symbol, payload.timeframe as Timeframe, 0, 0, exchange);
        if (signal) {
          setSelectedSignal(signal);
        }
      } catch (err) {
        console.error('Failed to load chart from notification click:', err);
      }
    },
    [signals]
  );

  // Load symbols from all active exchanges
  const loadSymbols = useCallback(async (exchangesToLoad: ExchangeId[] = filters.exchanges) => {
    setIsLoadingSymbols(true);
    setInitError(null);
    setCandleErrorNotice(null);

    try {
      const { symbols: list, errors } = await fetchAllActiveSymbols(
        exchangesToLoad,
        (health) => {
          setExchangeStatuses((prev) => ({
            ...prev,
            [health.exchange]: health,
          }));
        }
      );

      setExchangeErrors(errors);
      setSymbols(list);
      setIsLoadingSymbols(false);

      if (list.length === 0) {
        const errorDetails = Object.entries(errors)
          .map(([ex, msg]) => `${getExchangeDisplayName(ex as ExchangeId)}: ${msg}`)
          .join('\n');

        setInitError(
          `Hiçbir borsaya erişilemedi.\n${errorDetails}\nLütfen internet bağlantınızı veya DNS ayarlarınızı kontrol edin.`
        );
        return [];
      }

      return list;
    } catch (err: any) {
      const msg = err?.message || String(err);
      setInitError(`Piyasa listesi alınamadı: ${msg}`);
      setIsLoadingSymbols(false);
      return [];
    }
  }, [filters.exchanges]);

  // Initialize notifications, background scanner, and market symbols
  useEffect(() => {
    let isMounted = true;

    initNotificationService((payload) => {
      handleOpenFromNotification(payload);
    });

    const unsubscribeBg = backgroundScanner.onSignal((newSignal) => {
      setSignals((prev) => {
        const map = new Map<string, MajorBreakoutSignal>();
        for (const s of prev) map.set(`${s.exchange}-${s.symbol}-${s.timeframe}`, s);
        map.set(`${newSignal.exchange}-${newSignal.symbol}-${newSignal.timeframe}`, newSignal);
        return Array.from(map.values());
      });
      playBreakoutAlert();
    });

    loadSymbols().then((loaded) => {
      if (!isMounted) return;
      if (loaded && loaded.length > 0) {
        backgroundScanner.start(filters.timeframes, filters.exchanges, false);
      }
    });

    return () => {
      isMounted = false;
      stopRequestedRef.current = true;
      unsubscribeBg();
      backgroundScanner.stop();
    };
  }, []);

  // Update background scanner timeframes and exchanges when filters change
  useEffect(() => {
    backgroundScanner.setTimeframes(filters.timeframes);
    backgroundScanner.setExchanges(filters.exchanges);
  }, [filters.timeframes, filters.exchanges]);

  // Main Scanning Engine
  const triggerScan = async (
    targetSymbolsList?: SymbolInfo[],
    timeframesToScan?: Timeframe[]
  ) => {
    if (progress.isScanning) {
      return;
    }

    stopRequestedRef.current = false;
    pauseRequestedRef.current = false;
    setCandleErrorNotice(null);
    backgroundScanner.setPausedForManualScan(true);

    // If symbols list is empty, reload symbols first
    let currentSymbols = targetSymbolsList && targetSymbolsList.length > 0 ? targetSymbolsList : symbols;
    if (!currentSymbols || currentSymbols.length === 0) {
      currentSymbols = await loadSymbols(filters.exchanges);
      if (!currentSymbols || currentSymbols.length === 0) {
        backgroundScanner.setPausedForManualScan(false);
        return; // Error banner is already displayed by loadSymbols
      }
    }

    const tfs = timeframesToScan && timeframesToScan.length > 0 ? timeframesToScan : filters.timeframes;
    const totalItems = currentSymbols.length * tfs.length;

    setProgress({
      isScanning: true,
      isPaused: false,
      totalSymbols: totalItems,
      scannedSymbols: 0,
      currentSymbol: '',
      matchesCount: 0,
      speed: 0,
      startedAt: Date.now(),
    });

    const queue: Array<{ symbolInfo: SymbolInfo; tf: Timeframe }> = [];
    for (const sym of currentSymbols) {
      for (const tf of tfs) {
        queue.push({ symbolInfo: sym, tf });
      }
    }

    const discoveredSignals: MajorBreakoutSignal[] = [];
    const startTime = Date.now();
    let failedCandleCount = 0;
    let lastNetworkError = '';

    try {
      await runWithConcurrency(
        queue,
        async (item) => {
          while (pauseRequestedRef.current && !stopRequestedRef.current) {
            await new Promise((r) => setTimeout(r, 200));
          }

          if (stopRequestedRef.current) {
            return null;
          }

          const { symbolInfo, tf } = item;
          try {
            const candles = await fetchExchangeKlines(symbolInfo.symbol, tf, symbolInfo.exchange, 200);
            if (!candles || candles.length < 40) {
              failedCandleCount++;
              return null;
            }

            const signal = detectMajorBreakout(
              candles,
              symbolInfo.symbol,
              tf,
              symbolInfo.volume24hUsd,
              symbolInfo.change24h,
              symbolInfo.exchange
            );

            return signal;
          } catch (candleErr: any) {
            failedCandleCount++;
            lastNetworkError = candleErr?.message || String(candleErr);
            return null;
          }
        },
        8, // Safe concurrency to prevent 429
        async (completed, total, lastResult) => {
          const elapsedSec = Math.max(1, (Date.now() - startTime) / 1000);
          const currentSpeed = Math.round(completed / elapsedSec);

          if (lastResult) {
            discoveredSignals.push(lastResult);
            playBreakoutAlert();

            await sendBreakoutNotification(lastResult);

            setSignals((prev) => {
              const map = new Map<string, MajorBreakoutSignal>();
              for (const s of prev) {
                map.set(`${s.exchange}-${s.symbol}-${s.timeframe}`, s);
              }
              map.set(`${lastResult.exchange}-${lastResult.symbol}-${lastResult.timeframe}`, lastResult);
              return Array.from(map.values());
            });
          }

          setProgress((prev) => ({
            ...prev,
            scannedSymbols: completed,
            matchesCount: discoveredSignals.length,
            speed: currentSpeed,
            currentSymbol: queue[Math.min(completed, queue.length - 1)]?.symbolInfo.symbol || '',
          }));
        },
        () => stopRequestedRef.current
      );

      // Explicitly notify user if candle requests failed rather than pretending no signals exist
      if (failedCandleCount > 0) {
        if (failedCandleCount === totalItems) {
          setCandleErrorNotice(
            `Kritik Hata: Hiçbir mum verisi indirilemedi (0 / ${totalItems} başarılı). Borsa veya internet bağlantınızı kontrol edin. (Son hata: ${lastNetworkError || 'Bağlantı hatası'})`
          );
        } else if (failedCandleCount >= totalItems * 0.25) {
          setCandleErrorNotice(
            `Bilgi: ${failedCandleCount} / ${totalItems} çiftin mum verisi indirilemedi (${lastNetworkError || 'Ağ hatası'}). Diğer ${totalItems - failedCandleCount} çift başarıyla tarandı.`
          );
        }
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      setCandleErrorNotice(`Tarama sırasında hata oluştu: ${err?.message || String(err)}`);
    } finally {
      // Guarantee scan lock is ALWAYS reset
      setProgress((prev) => ({
        ...prev,
        isScanning: false,
        isPaused: false,
        currentSymbol: '',
      }));
      backgroundScanner.setPausedForManualScan(false);
    }
  };

  const handleStartScan = () => {
    if (progress.isScanning) return;
    setSignals([]);
    triggerScan(symbols, filters.timeframes);
  };

  const handlePauseScan = () => {
    pauseRequestedRef.current = !pauseRequestedRef.current;
    setProgress((prev) => ({
      ...prev,
      isPaused: pauseRequestedRef.current,
    }));
  };

  const handleStopScan = () => {
    stopRequestedRef.current = true;
    backgroundScanner.setPausedForManualScan(false);
    setProgress((prev) => ({
      ...prev,
      isScanning: false,
      isPaused: false,
      currentSymbol: '',
    }));
  };

  const toggleBackgroundTracking = () => {
    if (bgTrackingEnabled) {
      backgroundScanner.stop();
      setBgTrackingEnabled(false);
    } else {
      backgroundScanner.start(filters.timeframes, filters.exchanges);
      setBgTrackingEnabled(true);
    }
  };

  const handleSendTestNotification = async () => {
    const sampleSignal: MajorBreakoutSignal = {
      symbol: 'BTCUSDT',
      exchange: 'binance',
      timeframe: '1D',
      signalName: '🔥 MAJÖR DÜŞEN TREND KIRILDI',
      signalType: '🔥 MAJÖR DÜŞEN TREND KIRILDI',
      trendAgeDays: 184,
      trendAgeBars: 184,
      majorTouchCount: 3,
      breakoutPrice: 86450.0,
      currentPrice: 86520.0,
      tp1: 94200.0,
      tp2: 104500.0,
      sl: 81200.0,
      tp1Ratio: 1.45,
      tp2Ratio: 3.38,
      breakoutTime: Math.floor(Date.now() / 1000),
      breakoutTimeStr: 'Şimdi',
      trendlinePriceAtBreakout: 86100,
      startPrice: 108000,
      startDateStr: '12 Nis 2026',
      touches: [],
      klines: [],
      lineFormula: () => 0,
      volume24hUsd: 1500000000,
      change24h: 3.4,
      uniqueId: `test_btc_${Date.now()}`,
    };

    await sendBreakoutNotification(sampleSignal);
    playBreakoutAlert();
    setNotificationTestSent(true);
    setTimeout(() => setNotificationTestSent(false), 4000);
  };

  const handleRunDiagnostic = async () => {
    setIsRunningDiagnostic(true);
    setDiagnosticReport(null);
    try {
      const rep = await runDiagnosticReport();
      setDiagnosticReport(rep);
    } catch (e: any) {
      setDiagnosticReport(`Tanılama hatası: ${e?.message || String(e)}`);
    } finally {
      setIsRunningDiagnostic(false);
    }
  };

  const handleCopyReport = () => {
    if (!diagnosticReport) return;
    navigator.clipboard?.writeText(diagnosticReport);
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 3000);
  };

  // Filter signals strictly based on active filters
  const filteredSignals = useMemo(() => {
    return signals
      .filter((s) => {
        if (!filters.timeframes.includes(s.timeframe)) return false;
        if (filters.exchanges && filters.exchanges.length > 0 && !filters.exchanges.includes(s.exchange)) return false;
        if (s.majorTouchCount < filters.minTouches) return false;
        if (filters.searchQuery) {
          const q = filters.searchQuery.toUpperCase().trim();
          return s.symbol.toUpperCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => b.breakoutTime - a.breakoutTime);
  }, [signals, filters]);

  // When exchange filters change in FilterBar, reload symbols if needed
  const handleFilterChange = (updated: Partial<ScanFilterOptions>) => {
    setFilters((prev) => {
      const next = { ...prev, ...updated };
      if (updated.exchanges && updated.exchanges.length > 0) {
        loadSymbols(updated.exchanges);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Header with status badges and scan control */}
      <Header
        progress={progress}
        totalAvailableSymbols={symbols.length}
        soundEnabled={soundEnabled}
        exchangeStatuses={exchangeStatuses}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
        onStartScan={handleStartScan}
        onPauseScan={handlePauseScan}
        onStopScan={handleStopScan}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Background Tracker & Notification Status Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-bold text-white">
                  TRADINGLY Canlı Arka Plan Takibi
                </h4>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${
                    bgTrackingEnabled
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      bgTrackingEnabled ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'
                    }`}
                  />
                  {bgTrackingEnabled ? 'Arka Plan Aktif' : 'Durduruldu'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Bybit, Binance ve OKX sürekli taranır • Gerçek kırılımda anlık bildirim gönderilir
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/TRADINGLY-fixed.zip"
              download="TRADINGLY-fixed.zip"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              title="Düzeltilmiş Proje Dosyalarını (ZIP) İndir"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Projeyi İndir (ZIP)</span>
            </a>

            <button
              onClick={handleRunDiagnostic}
              disabled={isRunningDiagnostic}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              title="DNS, TCP ve TLS aşamalarını tek tek test et"
            >
              {isRunningDiagnostic ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>Test Ediliyor...</span>
                </>
              ) : (
                <>
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Ağ Tanısı</span>
                </>
              )}
            </button>

            <button
              onClick={handleSendTestNotification}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              {notificationTestSent ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Bildirim Gönderildi!</span>
                </>
              ) : (
                <>
                  <Bell className="w-3.5 h-3.5 text-amber-400" />
                  <span>Test Bildirimi Gönder</span>
                </>
              )}
            </button>

            <button
              onClick={toggleBackgroundTracking}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                bgTrackingEnabled
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              {bgTrackingEnabled ? 'Takip Açık' : 'Takibi Aç'}
            </button>
          </div>
        </div>

        {/* Exchange Partial Warning Banner (if one exchange failed but others are working) */}
        {Object.keys(exchangeErrors).length > 0 && symbols.length > 0 && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-amber-300 text-xs">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-bold text-sm text-amber-200">Borsa Bağlantı Uyarısı</h4>
              <p className="text-amber-300/90 mt-0.5 leading-relaxed">
                {Object.entries(exchangeErrors).map(([ex, msg]) => (
                  <span key={ex} className="block">
                    • <b>{getExchangeDisplayName(ex as ExchangeId)}:</b> {msg} (Yedek aynalar denendi)
                  </span>
                ))}
              </p>
              <p className="text-amber-400 font-semibold mt-1">
                Erişilebilen borsalar ({symbols.length} çift) üzerinden tarama eksiksiz olarak devam etmektedir.
              </p>
            </div>
            <button
              onClick={() => loadSymbols()}
              className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold rounded-xl text-xs shrink-0 transition-colors"
            >
              Yeniden Bağlan
            </button>
          </div>
        )}

        {/* Candle Error Notice (if candle fetches encountered network drops) */}
        {candleErrorNotice && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-between gap-3 text-rose-300 text-xs">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{candleErrorNotice}</span>
            </div>
            <button
              onClick={() => setCandleErrorNotice(null)}
              className="px-3 py-1 bg-rose-500/20 text-rose-300 rounded-lg text-xs font-bold hover:bg-rose-500/30"
            >
              Kapat
            </button>
          </div>
        )}

        {/* Loading Symbols State */}
        {isLoadingSymbols ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin" />
            <p className="text-sm font-bold text-slate-200">
              Bybit, Binance ve OKX vadeli sözleşmeleri alınıyor...
            </p>
            <p className="text-xs text-slate-500">
              Canlı piyasa listeleri ve ayna sunucuları kontrol ediliyor.
            </p>
          </div>
        ) : initError ? (
          /* Total Connection Failure Alert with Diagnostic Tools */
          <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex flex-col gap-4 text-rose-300">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-sm text-rose-200">Borsa Bağlantı Hatası</h3>
                  <p className="text-xs text-rose-300/90 whitespace-pre-line leading-relaxed mt-1 font-mono">
                    {initError}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={handleRunDiagnostic}
                  disabled={isRunningDiagnostic}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isRunningDiagnostic ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Tanılanıyor...</span>
                    </>
                  ) : (
                    <>
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Ağ Tanılaması Yap</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => loadSymbols()}
                  className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-colors shrink-0 cursor-pointer"
                >
                  Yeniden Bağlan
                </button>
              </div>
            </div>

            {/* In-app Diagnostic Report Panel */}
            {diagnosticReport && (
              <div className="mt-3 p-4 bg-slate-950/90 border border-slate-800 rounded-xl">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Terminal className="w-4 h-4" />
                    Android Ağ ve Aşama Tanılama Raporu
                  </span>
                  <button
                    onClick={handleCopyReport}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] cursor-pointer"
                  >
                    {reportCopied ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Kopyalandı</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Kopyala</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                  {diagnosticReport}
                </pre>
              </div>
            )}
          </div>
        ) : (
          /* Normal Scanner Content */
          <>
            <FilterBar
              filters={filters}
              onChangeFilters={handleFilterChange}
              availableTimeframes={AVAILABLE_TIMEFRAMES}
            />

            {/* Results Header Strip */}
            <div className="flex items-center justify-between px-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-bold text-slate-300">
                  Gerçekleşen Majör Kırılımlar: <b className="text-emerald-400 font-mono text-sm">{filteredSignals.length}</b> Sinyal
                </span>
              </div>
              <div className="text-slate-500">
                Seçili Dilimler: <b className="text-slate-300">{filters.timeframes.join(', ')}</b> | Asgari: <b className="text-amber-400">{filters.minTouches}+ Tepe</b>
              </div>
            </div>

            {/* Signals Grid */}
            {filteredSignals.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredSignals.map((signal, idx) => (
                  <TrendCard
                    key={`${signal.exchange}-${signal.symbol}-${signal.timeframe}-${idx}`}
                    signal={signal}
                    onOpenChart={setSelectedSignal}
                  />
                ))}
              </div>
            ) : (
              /* Empty state / scan completion state */
              <div className="p-10 text-center bg-slate-900/60 border border-slate-800 rounded-3xl space-y-4 max-w-2xl mx-auto my-6">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-7 h-7 stroke-[2]" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-black text-white tracking-wide">
                    {progress.isScanning ? 'Tarama Devam Ediyor...' : 'Şu Anda Aktif Sinyal Yok'}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {symbols.length} aktif coin taranıp <b className="text-amber-400">0 sinyal bulunması tamamen normaldir</b>. Sinyal üretmek için kurallar asla gevşetilmez.
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Yalnızca aylarca süren majör düşen trendin son kapanan mumda yukarı kırıldığı (gerçek cross) nadir ve yüksek kaliteli anlar tespit edilir.
                  </p>
                </div>
                {!progress.isScanning && (
                  <div className="pt-2">
                    <button
                      onClick={handleStartScan}
                      className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-emerald-500/20 cursor-pointer transition-all"
                    >
                      Tüm Coinleri Yeniden Tara ({symbols.length} Çift)
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Interactive Chart Modal */}
      <ChartModal
        signal={selectedSignal}
        onClose={() => setSelectedSignal(null)}
      />
    </div>
  );
}
