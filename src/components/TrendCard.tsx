import React from 'react';
import {
  ExternalLink,
  Calendar,
  BarChart2,
  Flame,
  Award,
  CheckCircle,
  ShieldAlert,
  Target,
} from 'lucide-react';
import { MajorBreakoutSignal } from '../types/scanner';

interface TrendCardProps {
  signal: MajorBreakoutSignal;
  onOpenChart: (signal: MajorBreakoutSignal) => void;
}

export const TrendCard: React.FC<TrendCardProps> = ({ signal, onOpenChart }) => {
  const isRetest = signal.isRetest;
  const isHighVolume = signal.isHighVolume;
  const exchange = signal.exchange || 'bybit';

  const exchangeLabel =
    exchange === 'binance'
      ? 'Binance USDT-M'
      : exchange === 'okx'
      ? 'OKX USDT Swap'
      : 'Bybit USDT Perpetual';

  const tradeUrl =
    exchange === 'binance'
      ? `https://www.binance.com/en/futures/${signal.symbol}`
      : exchange === 'okx'
      ? `https://www.okx.com/trade-swap/${signal.symbol.toLowerCase()}`
      : `https://www.bybit.com/trade/usdt/${signal.symbol}`;

  return (
    <div className="relative bg-slate-900 border-2 border-emerald-500/40 hover:border-emerald-500 rounded-2xl p-5 shadow-xl shadow-emerald-500/5 transition-all flex flex-col justify-between gap-4">
      {/* Top Banner */}
      <div>
        {/* Signal Tag */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${
              isRetest
                ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                : isHighVolume
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
            }`}
          >
            {isRetest ? (
              <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <Flame className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{signal.signalName}</span>
          </span>

          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-800 text-slate-300 border border-slate-700 font-mono">
              {exchange}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-amber-500 text-slate-950 font-mono">
              {signal.timeframe}
            </span>
          </div>
        </div>

        {/* COIN Header & Live Price */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-white font-extrabold text-sm">
              {signal.symbol.slice(0, 3)}
            </div>
            <div>
              <h3 className="text-xl font-black text-white tracking-wide">{signal.symbol}</h3>
              <p className="text-[11px] text-slate-400">{exchangeLabel}</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              ANLIK FİYAT
            </span>
            <span className="text-lg font-black text-white font-mono">
              ${signal.currentPrice.toFixed(4)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Spec Grid */}
      <div className="space-y-2 py-1">
        {/* TREND YAŞI & MAJÖR TEMAS */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/70 text-xs">
            <span className="text-slate-400 flex items-center gap-1 font-medium text-[11px]">
              <Calendar className="w-3 h-3 text-amber-400" />
              <span>TREND YAŞI:</span>
            </span>
            <span className="font-extrabold text-white font-mono text-xs mt-0.5 block">
              {signal.trendAgeDays} Gün ({signal.trendAgeBars}B)
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/70 text-xs">
            <span className="text-slate-400 flex items-center gap-1 font-medium text-[11px]">
              <Award className="w-3 h-3 text-amber-400" />
              <span>MAJÖR TEMAS:</span>
            </span>
            <span className="font-extrabold text-amber-400 font-mono text-xs mt-0.5 block">
              {signal.majorTouchCount} Tepe (L.H.)
            </span>
          </div>
        </div>

        {/* KIRILIM FİYATI & ZAMANI */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
          <div className="flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400 font-semibold">KIRILIM:</span>
            <span className="font-mono font-black text-emerald-300">
              ${signal.breakoutPrice.toFixed(4)}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {signal.breakoutTimeStr}
          </div>
        </div>

        {/* STRUCTURAL TP1, TP2 & SL LEVELS */}
        <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 border-b border-slate-800/80 pb-1.5">
            <span className="flex items-center gap-1 text-slate-300">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              <span>HEDEFLER & GEÇERSİZLİK (R/R)</span>
            </span>
            <span className="text-[10px] text-amber-400/90 font-mono">Fib + HTF Direnç</span>
          </div>

          {/* TP1 & TP2 Row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-emerald-400">TP1:</span>
                <span className="font-mono font-bold text-slate-300 text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                  R/R: {signal.tp1Ratio}
                </span>
              </div>
              <span className="font-mono font-black text-emerald-300 text-sm mt-1 block">
                ${signal.tp1.toFixed(4)}
              </span>
            </div>

            <div className="p-2 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-cyan-400">TP2:</span>
                <span className="font-mono font-bold text-slate-300 text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                  R/R: {signal.tp2Ratio}
                </span>
              </div>
              <span className="font-mono font-black text-cyan-300 text-sm mt-1 block">
                ${signal.tp2.toFixed(4)}
              </span>
            </div>
          </div>

          {/* SL Row */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs">
            <span className="text-rose-400 font-bold flex items-center gap-1 text-[11px]">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>STOP LOSS (SL):</span>
            </span>
            <span className="font-mono font-black text-rose-300 text-xs">
              ${signal.sl.toFixed(4)}
            </span>
          </div>
        </div>
      </div>

      {/* Action Button: GRAFİĞİ AÇ & Exchange Link */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onOpenChart(signal)}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black rounded-xl text-xs sm:text-sm shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
        >
          <BarChart2 className="w-4 h-4 stroke-[2.5]" />
          <span>GRAFİĞİ AÇ</span>
        </button>

        <a
          href={tradeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2.5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl transition-colors shrink-0"
          title={`${exchangeLabel} üzerinde aç`}
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
};
