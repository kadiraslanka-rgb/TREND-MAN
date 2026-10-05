import React from 'react';
import {
  ExternalLink,
  X,
  Flame,
  Calendar,
  Award,
  Clock,
  Target,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { MajorBreakoutSignal } from '../types/scanner';
import { CandleChart } from './CandleChart';

interface ChartModalProps {
  signal: MajorBreakoutSignal | null;
  onClose: () => void;
}

export const ChartModal: React.FC<ChartModalProps> = ({ signal, onClose }) => {
  if (!signal) return null;

  const exchange = signal.exchange || 'bybit';
  const tradeUrl =
    exchange === 'binance'
      ? `https://www.binance.com/en/futures/${signal.symbol}`
      : exchange === 'okx'
      ? `https://www.okx.com/trade-swap/${signal.symbol.toLowerCase()}`
      : `https://www.bybit.com/trade/usdt/${signal.symbol}`;

  const exchangeLabel =
    exchange === 'binance' ? 'Binance' : exchange === 'okx' ? 'OKX' : 'Bybit';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl max-h-[94vh] flex flex-col bg-slate-900 border-2 border-emerald-500/40 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-base">
              {signal.symbol.slice(0, 3)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-wide">
                  {signal.symbol}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  {exchange}
                </span>
                <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-amber-500 text-slate-950 font-mono">
                  {signal.timeframe}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 fill-emerald-400" />
                  <span>{signal.signalName}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <a
              href={tradeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
            >
              <span>{exchangeLabel}'te İşlem Yap</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* 1. CLEAN TRADINGVIEW-STYLE CHART (No text overlays on candles) */}
          <CandleChart candles={signal.klines} signal={signal} height={460} />

          {/* 2. İŞLEM PLANI SECTION (Directly under the chart) */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs sm:text-sm font-black text-white tracking-wider uppercase">
                  İŞLEM PLANI
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Fibonacci + HTF Direnç Confluence
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* ANLIK FİYAT */}
              <div className="bg-slate-900/90 border border-amber-500/30 p-3.5 rounded-xl">
                <span className="text-[11px] font-bold text-amber-400 block uppercase tracking-wider">
                  ANLIK FİYAT
                </span>
                <span className="text-xl font-black text-white font-mono mt-1 block">
                  ${signal.currentPrice.toFixed(4)}
                </span>
              </div>

              {/* TP1 */}
              <div className="bg-slate-900/90 border border-emerald-500/40 p-3.5 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                    TP1
                  </span>
                  <span className="text-[10px] font-mono font-black text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                    R/R {signal.tp1Ratio}
                  </span>
                </div>
                <span className="text-xl font-black text-emerald-400 font-mono mt-1 block">
                  ${signal.tp1.toFixed(4)}
                </span>
              </div>

              {/* TP2 */}
              <div className="bg-slate-900/90 border border-cyan-500/40 p-3.5 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                    TP2
                  </span>
                  <span className="text-[10px] font-mono font-black text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                    R/R {signal.tp2Ratio}
                  </span>
                </div>
                <span className="text-xl font-black text-cyan-400 font-mono mt-1 block">
                  ${signal.tp2.toFixed(4)}
                </span>
              </div>

              {/* STOP LOSS */}
              <div className="bg-slate-900/90 border border-rose-500/40 p-3.5 rounded-xl">
                <span className="text-[11px] font-bold text-rose-400 block uppercase tracking-wider">
                  STOP LOSS (SL)
                </span>
                <span className="text-xl font-black text-rose-400 font-mono mt-1 block">
                  ${signal.sl.toFixed(4)}
                </span>
              </div>
            </div>
          </div>

          {/* 3. TREND BİLGİLERİ SECTION */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>TREND YAŞI</span>
              </span>
              <span className="text-base sm:text-lg font-black text-white font-mono mt-1 block">
                {signal.trendAgeDays} Gün{' '}
                <span className="text-xs text-slate-500 font-normal">
                  ({signal.trendAgeBars} Bar)
                </span>
              </span>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                <span>MAJÖR TEMAS</span>
              </span>
              <span className="text-base sm:text-lg font-black text-amber-400 font-mono mt-1 block">
                {signal.majorTouchCount} Tepe
              </span>
            </div>

            <div className="bg-slate-950/80 border border-emerald-500/20 bg-emerald-500/5 p-3 rounded-xl">
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                <Flame className="w-3.5 h-3.5 text-emerald-400" />
                <span>KIRILIM FİYATI</span>
              </span>
              <span className="text-base sm:text-lg font-black text-emerald-400 font-mono mt-1 block">
                ${signal.breakoutPrice.toFixed(4)}
              </span>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>KIRILIM ZAMANI</span>
              </span>
              <span className="text-xs font-bold text-slate-200 font-mono mt-1.5 block">
                {signal.breakoutTimeStr}
              </span>
            </div>
          </div>

          {/* 4. Majör Tepe Temas Noktaları */}
          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
              Majör Tepe Temas Noktaları ({signal.touches.length})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              {signal.touches.map((t, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg border border-slate-800"
                >
                  <span className="font-bold text-amber-400 font-mono">Tepe {idx + 1}</span>
                  <span className="text-slate-300">{t.dateStr}</span>
                  <span className="font-mono text-slate-100 font-semibold">
                    ${t.candleHigh.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
