import React, { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  LineStyle,
  createSeriesMarkers,
  IChartApi,
} from 'lightweight-charts';
import { KlineCandle, MajorBreakoutSignal } from '../types/scanner';

interface CandleChartProps {
  candles: KlineCandle[];
  signal: MajorBreakoutSignal;
  height?: number;
}

export const CandleChart: React.FC<CandleChartProps> = ({ candles, signal, height = 480 }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    // Dispose prior chart instance cleanly
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0B0F19' },
        textColor: '#94A3B8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.4)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.4)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      timeScale: {
        borderColor: '#1E293B',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1E293B',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      crosshair: {
        vertLine: {
          color: 'rgba(148, 163, 184, 0.2)',
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: 'rgba(148, 163, 184, 0.2)',
          style: LineStyle.Dashed,
        },
      },
    });

    chartInstanceRef.current = chart;

    // 1. Candlestick Series (Mumlar)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });

    const formattedCandles = candles
      .map((c) => ({
        time: c.time as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      .filter((c, idx, arr) => idx === 0 || c.time > arr[idx - 1].time);

    candleSeries.setData(formattedCandles);

    // 2. Major Descending Trendline Series (Temiz Çizgi - Üzerinde uzun yazı YOK)
    const trendlineSeries = chart.addSeries(LineSeries, {
      color: '#F59E0B',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      title: '', // Metin yok - mumların önünü kapatmaz
      priceLineVisible: false,
    });

    const trendData: Array<{ time: any; value: number }> = [];
    const startIndex = Math.max(0, candles.length - 1 - signal.trendAgeBars);

    for (let i = startIndex; i < candles.length; i++) {
      const c = candles[i];
      const lineY = signal.lineFormula(i);
      if (lineY > 0) {
        trendData.push({
          time: c.time as any,
          value: Number(lineY.toFixed(6)),
        });
      }
    }

    // Extrapolate a few future bars
    if (candles.length > 0 && trendData.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const avgIntervalSec =
        candles.length > 1
          ? (candles[candles.length - 1].time - candles[0].time) / (candles.length - 1)
          : 86400;

      for (let step = 1; step <= 6; step++) {
        const futureTime = lastCandle.time + step * avgIntervalSec;
        const futureLineY = signal.lineFormula(candles.length - 1 + step);
        if (futureLineY > 0) {
          trendData.push({
            time: Math.floor(futureTime) as any,
            value: Number(futureLineY.toFixed(6)),
          });
        }
      }
    }

    const uniqueTrendData = trendData.filter(
      (p, idx, arr) => idx === 0 || p.time > arr[idx - 1].time
    );

    trendlineSeries.setData(uniqueTrendData);

    // 3. Markers: Temas Noktaları ve Kırılım Mumu (BÜYÜK YAZILAR KALDIRILDI)
    // Temas noktaları sadece küçük ok/nokta olarak gösterilir, mumları örtmez
    const markers: any[] = signal.touches.map((touch) => ({
      time: touch.time as any,
      position: 'aboveBar' as const,
      color: '#F59E0B',
      shape: 'arrowDown' as const,
      size: 1,
    }));

    // Kırılım mumu: sadece küçük 🔥 sembolü
    markers.push({
      time: signal.breakoutTime as any,
      position: 'belowBar' as const,
      color: '#10B981',
      shape: 'arrowUp' as const,
      text: '🔥',
      size: 1,
    });

    createSeriesMarkers(candleSeries, markers);

    // 4. TP2 Yatay Seviyesi (Sağ eksende kompakt etiket)
    if (signal.tp2 && signal.tp2 > 0) {
      candleSeries.createPriceLine({
        price: signal.tp2,
        color: '#06B6D4',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'TP2',
      });
    }

    // 5. TP1 Yatay Seviyesi (Sağ eksende kompakt etiket)
    if (signal.tp1 && signal.tp1 > 0) {
      candleSeries.createPriceLine({
        price: signal.tp1,
        color: '#10B981',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'TP1',
      });
    }

    // 6. ANLIK FİYAT (NOW)
    if (signal.currentPrice && signal.currentPrice > 0) {
      candleSeries.createPriceLine({
        price: signal.currentPrice,
        color: '#F59E0B',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'NOW',
      });
    }

    // 7. STOP LOSS (SL)
    if (signal.sl && signal.sl > 0) {
      candleSeries.createPriceLine({
        price: signal.sl,
        color: '#F43F5E',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'SL',
      });
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [candles, signal, height]);

  return (
    <div className="w-full relative rounded-xl overflow-hidden border border-slate-800 bg-[#0B0F19]">
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
};
