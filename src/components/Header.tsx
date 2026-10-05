import React from 'react';
import { Activity, Play, Pause, Square, Flame, Volume2, VolumeX, AlertTriangle, ShieldCheck } from 'lucide-react';
import { ExchangeHealthStatus, ScanProgress } from '../types/scanner';

interface HeaderProps {
  progress: ScanProgress;
  totalAvailableSymbols: number;
  soundEnabled: boolean;
  exchangeStatuses: Record<string, ExchangeHealthStatus>;
  onToggleSound: () => void;
  onStartScan: () => void;
  onPauseScan: () => void;
  onStopScan: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  progress,
  totalAvailableSymbols,
  soundEnabled,
  exchangeStatuses,
  onToggleSound,
  onStartScan,
  onPauseScan,
  onStopScan,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/95 sticky top-0 z-30 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-slate-950 font-black">
            <Flame className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
                TRADINGLY <span className="text-emerald-400 font-extrabold text-sm sm:text-base">SCANNER</span>
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Canlı Piyasa: {totalAvailableSymbols} Çift</span>
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-slate-400">
                Uzun Süreli Majör Düşen Trend Kırılımları • Canlı Borsa Taraması
              </p>
              {/* Exchange Status Badges */}
              <div className="hidden md:flex items-center gap-1.5 text-[10px]">
                {['bybit', 'binance', 'okx'].map((exKey) => {
                  const st = exchangeStatuses[exKey];
                  const isOnline = st?.status === 'online';
                  const isError = st?.status === 'error';
                  const isConnecting = st?.status === 'connecting';

                  return (
                    <span
                      key={exKey}
                      title={st?.error || `${st?.name || exKey.toUpperCase()} aktif (${st?.symbolCount || 0} çift)`}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        isOnline
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : isError
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : isConnecting
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isOnline
                            ? 'bg-emerald-400'
                            : isError
                            ? 'bg-rose-400'
                            : isConnecting
                            ? 'bg-amber-400 animate-pulse'
                            : 'bg-slate-500'
                        }`}
                      />
                      <span>{exKey}</span>
                      {st?.symbolCount ? <span className="font-mono text-[9px]">({st.symbolCount})</span> : null}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onToggleSound}
            title={soundEnabled ? 'Sesli Uyarı Açık' : 'Sesli Uyarı Kapalı'}
            className={`p-2 rounded-xl border text-xs font-medium transition-colors ${
              soundEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {!progress.isScanning ? (
            <button
              onClick={onStartScan}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black rounded-xl text-xs sm:text-sm shadow-lg shadow-emerald-500/25 transition-all active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>Taramayı Başlat ({totalAvailableSymbols || '...'} Coin)</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onPauseScan}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs border border-slate-700 transition-colors"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>{progress.isPaused ? 'Devam Et' : 'Duraklat'}</span>
              </button>
              <button
                onClick={onStopScan}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold rounded-xl text-xs border border-rose-500/30 transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-rose-400" />
                <span>Durdur</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar Header Strip */}
      {progress.isScanning && (
        <div className="w-full bg-slate-950 border-t border-slate-800 px-4 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Activity className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
              <span>
                Taranıyor:{' '}
                <span className="font-bold font-mono text-emerald-400">{progress.currentSymbol || '...'}</span>
              </span>
              <span className="text-slate-500">|</span>
              <span>
                İlerleme:{' '}
                <span className="font-bold text-white font-mono">
                  {progress.scannedSymbols} / {progress.totalSymbols}
                </span>{' '}
                ({Math.round((progress.scannedSymbols / (progress.totalSymbols || 1)) * 100)}%)
              </span>
              <span className="text-slate-500">|</span>
              <span>
                Hız: <span className="font-bold text-slate-200">{progress.speed} çift/sn</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                Bulunan Gerçek Kırılım: <b className="font-mono text-white ml-1">{progress.matchesCount}</b>
              </span>
            </div>
          </div>
          <div className="max-w-7xl mx-auto mt-1.5 w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300 rounded-full"
              style={{
                width: `${Math.min(
                  100,
                  Math.round((progress.scannedSymbols / (progress.totalSymbols || 1)) * 100)
                )}%`,
              }}
            />
          </div>
        </div>
      )}
    </header>
  );
};
