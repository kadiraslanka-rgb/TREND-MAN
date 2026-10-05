import React from 'react';
import { Search, Check, Sparkles } from 'lucide-react';
import { ExchangeId, ScanFilterOptions, Timeframe } from '../types/scanner';

interface FilterBarProps {
  filters: ScanFilterOptions;
  onChangeFilters: (updated: Partial<ScanFilterOptions>) => void;
  availableTimeframes: Timeframe[];
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChangeFilters,
  availableTimeframes,
}) => {
  const toggleTimeframe = (tf: Timeframe) => {
    let next: Timeframe[];
    if (filters.timeframes.includes(tf)) {
      if (filters.timeframes.length === 1) return; // keep at least 1
      next = filters.timeframes.filter((t) => t !== tf);
    } else {
      next = [...filters.timeframes, tf];
    }
    onChangeFilters({ timeframes: next });
  };

  const selectSingleTimeframe = (tf: Timeframe) => {
    onChangeFilters({ timeframes: [tf] });
  };

  const toggleExchange = (ex: ExchangeId) => {
    const current = filters.exchanges || ['bybit', 'binance', 'okx'];
    let next: ExchangeId[];
    if (current.includes(ex)) {
      if (current.length === 1) return; // keep at least 1
      next = current.filter((e) => e !== ex);
    } else {
      next = [...current, ex];
    }
    onChangeFilters({ exchanges: next });
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3.5">
      {/* Timeframes & Exchanges Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Timeframes */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-300 mr-1">
            Zaman Dilimi:
          </span>
          <div className="flex flex-wrap bg-slate-950 p-1 rounded-xl border border-slate-800">
            {availableTimeframes.map((tf) => {
              const isActive = filters.timeframes.includes(tf);
              return (
                <button
                  key={tf}
                  onClick={() => toggleTimeframe(tf)}
                  onDoubleClick={() => selectSingleTimeframe(tf)}
                  title={`${tf} zaman dilimini seç/kaldır`}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-md font-black shadow-amber-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {isActive && <Check className="w-3 h-3 stroke-[3]" />}
                  <span>{tf}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => onChangeFilters({ timeframes: [...availableTimeframes] })}
            className="text-[11px] font-medium text-amber-400/90 hover:text-amber-300 underline px-1.5 transition-colors cursor-pointer"
          >
            Tüm Dilimleri Seç
          </button>
        </div>

        {/* Exchanges Selection */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300 mr-1">Borsalar:</span>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {(['bybit', 'binance', 'okx'] as ExchangeId[]).map((ex) => {
              const isSelected = (filters.exchanges || ['bybit', 'binance', 'okx']).includes(ex);
              return (
                <button
                  key={ex}
                  onClick={() => toggleExchange(ex)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold uppercase transition-all ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  <span>{ex}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Min Touches Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <span className="px-2 text-slate-400 font-medium">Asgari Tepe Teması:</span>
            <button
              onClick={() => onChangeFilters({ minTouches: 2 })}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                filters.minTouches === 2
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              2+ Temas
            </button>
            <button
              onClick={() => onChangeFilters({ minTouches: 3 })}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg font-black transition-all ${
                filters.minTouches === 3
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-amber-400/90 hover:text-amber-300'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>3+ Temas (Majör)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Coin ara (örn: ETHFI, VIRTUAL, BTC)..."
            value={filters.searchQuery}
            onChange={(e) => onChangeFilters({ searchQuery: e.target.value })}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="text-xs text-slate-400">
          Hedef: <b className="text-emerald-400">Yalnızca son kapanan mumda kırılan majör trendler</b>
        </div>
      </div>
    </div>
  );
};
