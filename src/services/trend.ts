import {
  KlineCandle,
  MajorBreakoutSignal,
  BreakoutSignalType,
  Timeframe,
  TrendTouch,
  ExchangeId,
} from '../types/scanner';
import { calculateTargets } from './targetService';

interface MacroPivot {
  index: number;
  time: number;
  high: number;
  low: number;
  close: number;
  prominence: number;
}

/**
 * Format timestamp to readable Turkish date string
 */
function formatDateTime(timeInSeconds: number): string {
  const d = new Date(timeInSeconds * 1000);
  return d.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(timeInSeconds: number): string {
  const d = new Date(timeInSeconds * 1000);
  return d.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Compute Average True Range (ATR) across the series for dynamic volatility-based buffers
 */
export function computeATR(candles: KlineCandle[], period = 14): number[] {
  const n = candles.length;
  const atrs = new Array<number>(n).fill(0);
  if (n < 2) return atrs;

  const trs = new Array<number>(n).fill(0);
  trs[0] = candles[0].high - candles[0].low;

  for (let i = 1; i < n; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    trs[i] = Math.max(hl, hc, lc);
  }

  let sum = 0;
  const initPeriod = Math.min(period, n);
  for (let i = 0; i < initPeriod; i++) {
    sum += trs[i];
  }
  const initAtr = sum / initPeriod;

  for (let i = 0; i < initPeriod; i++) {
    atrs[i] = initAtr;
  }

  for (let i = period; i < n; i++) {
    sum += trs[i] - trs[i - period];
    atrs[i] = sum / period;
  }

  return atrs;
}

/**
 * Minimum total duration in days required for a trend to qualify as a "Majör Uzun Süreli Trend"
 */
const MIN_DURATION_DAYS: Record<Timeframe, number> = {
  '4H': 18,   // at least 18 days (~108 bars)
  '6H': 25,   // at least 25 days (~100 bars)
  '1D': 60,   // at least 2 months of structural downtrend
  '3D': 120,  // at least 4 months
  '1W': 180,  // at least 6 months
  '1M': 365,  // at least 1 year
};

/**
 * Minimum bars required between Anchor 1 and breakout candle
 */
const MIN_SPAN_BARS: Record<Timeframe, number> = {
  '4H': 70,
  '6H': 60,
  '1D': 45,
  '3D': 30,
  '1W': 20,
  '1M': 10,
};

/**
 * RULE 1 — MAJÖR SWING HIGH TESPİTİ
 * Detect distinct macro peaks with wide lookback and prominence above surrounding troughs.
 */
export function findMacroSwingHighs(
  candles: KlineCandle[],
  timeframe: Timeframe,
  atrs: number[]
): MacroPivot[] {
  // Broad lookback windows to ignore micro bumps and small zigzags
  const lookback = ['4H', '6H'].includes(timeframe)
    ? 8
    : ['1D', '3D'].includes(timeframe)
    ? 6
    : 4;

  const pivots: MacroPivot[] = [];
  const n = candles.length;

  for (let i = lookback; i < n - lookback; i++) {
    const currentHigh = candles[i].high;
    let isPivot = true;

    // Check left bars
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high > currentHigh) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) continue;

    // Check right bars
    for (let j = 1; j <= lookback; j++) {
      if (candles[i + j].high > currentHigh) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) continue;

    // RULE 1: Prominence check - peak must clearly rise above surrounding lowest lows
    let minLow = currentHigh;
    for (let j = -lookback; j <= lookback; j++) {
      if (candles[i + j].low < minLow) {
        minLow = candles[i + j].low;
      }
    }

    const prominence = currentHigh - minLow;
    const atr = atrs[i] || candles[i].close * 0.03;

    // Prominence must be at least 1.8x ATR to qualify as a major structural peak
    if (prominence >= 1.8 * atr) {
      pivots.push({
        index: i,
        time: candles[i].time,
        high: currentHigh,
        low: candles[i].low,
        close: candles[i].close,
        prominence,
      });
    }
  }

  return pivots;
}

/**
 * STRICT NİZAMİ MAJÖR DÜŞEN TREND TESPİT VE KIRILIM MOTORU
 *
 * Implements all 21 user specifications:
 * 1. Büyük majör tepeden başlamalı (Anchor 1 true macro high).
 * 2. Uzun süre devam etmeli.
 * 3. Belirgin şekilde aşağı eğimli olmalı.
 * 4. En az 3 GERÇEK MAJÖR temas içermeli (Lower High: Touch1 > Touch2 > Touch3).
 * 5. Fiyat çizginin altında kalmalı (Clean Resistance Boundary).
 * 6. Fiyat çizginin üstüne-altına sürekli geçmemeli (KIR -> DÜŞ -> KIR -> DÜŞ yasak).
 * 7. Her temastan sonra aşağı doğru belirgin rejection/satış gelmeli.
 * 8. Çizgi fiyat hareketinin içinden geçmemeli.
 * 9. TRBUSDT 3D regression test: Daha yukarıda ana trend varken alttaki ikincil trend seçilemez.
 * 10. Kırılım sadece SON KAPANMIŞ MUMDA ve DECISIVE BUFFER ile teyit edilir.
 * 11. Hacim teyidi ve retest doğrulaması etiketlenir.
 */
export function detectMajorBreakout(
  candles: KlineCandle[],
  symbol: string,
  timeframe: Timeframe,
  volume24hUsd: number = 0,
  change24h: number = 0,
  exchange: ExchangeId = 'bybit'
): MajorBreakoutSignal | null {
  if (!candles || candles.length < 50) {
    return null;
  }

  const n = candles.length;
  const atrs = computeATR(candles, 14);
  const pivots = findMacroSwingHighs(candles, timeframe, atrs);

  if (pivots.length < 2) {
    return null;
  }

  const minDurationDays = MIN_DURATION_DAYS[timeframe];
  const minSpanBars = MIN_SPAN_BARS[timeframe];

  // In Bybit API, candle[n-1] is currently live/in-progress.
  // The last COMPLETED closed candle is at index n - 2 (or n - 1 if candle finished).
  // Test both candidate closed candles (n-1 and n-2)
  const candidateClosedPairs = [
    { prevIdx: n - 2, currIdx: n - 1 },
    { prevIdx: n - 3, currIdx: n - 2 },
  ];

  // Find the absolute highest macro peak in the entire dataset (Rule 2 & Rule 10)
  let maxPeriodHigh = 0;
  for (let i = 0; i < n; i++) {
    if (candles[i].high > maxPeriodHigh) {
      maxPeriodHigh = candles[i].high;
    }
  }

  // Calculate 20-period average volume for volume confirmation
  let volSum20 = 0;
  for (let i = Math.max(0, n - 22); i < n - 2; i++) {
    volSum20 += candles[i].volume;
  }
  const avgVol20 = volSum20 / 20 || 1;

  let bestSignal: MajorBreakoutSignal | null = null;
  let bestQualityScore = -Infinity;

  for (const pair of candidateClosedPairs) {
    if (pair.prevIdx < 0 || pair.currIdx >= n) continue;

    const prevCandle = candles[pair.prevIdx];
    const currCandle = candles[pair.currIdx];
    const currAtr = atrs[pair.currIdx] || currCandle.close * 0.03;

    // RULE 11 & 12: Decisive breakout buffer (not a 1-tick flicker)
    const breakoutBuffer = Math.max(0.18 * currAtr, currCandle.close * 0.0035);

    for (let p1 = 0; p1 < pivots.length; p1++) {
      const pivot1 = pivots[p1];

      // RULE 2: ANCHOR 1 MUST BE A TRUE MAJOR CEILING
      // It must be at least 78% of the period's absolute highest high
      // or among the top 3 highest macro peaks in history.
      const isTopTierHigh =
        pivot1.high >= 0.78 * maxPeriodHigh ||
        pivots.filter((p) => p.high > pivot1.high).length <= 2;

      if (!isTopTierHigh) {
        continue;
      }

      // Span requirement from Anchor 1 to breakout candle
      const trendAgeBars = pair.currIdx - pivot1.index;
      if (trendAgeBars < minSpanBars) {
        continue;
      }

      const trendAgeDays = Math.round((currCandle.time - pivot1.time) / 86400);
      if (trendAgeDays < minDurationDays) {
        continue;
      }

      for (let p2 = p1 + 1; p2 < pivots.length; p2++) {
        const pivot2 = pivots[p2];

        // Anchor 2 must be meaningfully before the breakout candle
        if (pivot2.index >= pair.prevIdx - 6) {
          continue;
        }

        // RULE 4: LOWER HIGH MANDATORY (Touch1 > Touch2)
        if (pivot2.high >= pivot1.high) {
          continue;
        }

        // Minimum bar span between Anchor 1 and Anchor 2 (at least 12-16 bars)
        const peakSpan = pivot2.index - pivot1.index;
        if (peakSpan < 12) {
          continue;
        }

        const slope = (pivot2.high - pivot1.high) / peakSpan;
        if (slope >= 0) continue;

        const lineFormula = (barIndex: number) => {
          return pivot1.high + slope * (barIndex - pivot1.index);
        };

        const lineAtCurr = lineFormula(pair.currIdx);
        const lineAtPrev = lineFormula(pair.prevIdx);

        if (lineAtCurr <= 0 || lineAtPrev <= 0) continue;

        // RULE 5: Significant descending slope (min 18% total drop along line)
        const totalDropPct = (pivot1.high - lineAtCurr) / pivot1.high;
        if (totalDropPct < 0.18) {
          continue;
        }

        // RULE 6 & 7: CLEAN RESISTANCE & NO HISTORICAL VIOLATIONS
        // Check ALL candles between Anchor 1 and the candle before breakout
        let violationCloses = 0;
        let isInvalidResistance = false;
        let candleCountUnder = 0;
        const totalCheckedBars = pair.prevIdx - pivot1.index;

        for (let i = pivot1.index; i <= pair.prevIdx; i++) {
          const lineY = lineFormula(i);
          const c = candles[i];
          const barAtr = atrs[i] || c.close * 0.03;

          // A candle closing clearly above the line is a VIOLATION
          if (c.close > lineY + 0.28 * barAtr) {
            violationCloses++;
            if (violationCloses >= 2) {
              isInvalidResistance = true;
              break;
            }
          }

          // Candle body cutting through the line
          if (Math.min(c.open, c.close) > lineY) {
            isInvalidResistance = true;
            break;
          }

          if (c.close <= lineY) {
            candleCountUnder++;
          }
        }

        if (isInvalidResistance) {
          continue;
        }

        // At least 95% of closed candles must have been under the trendline
        if (candleCountUnder / totalCheckedBars < 0.95) {
          continue;
        }

        // RULE 10: OVERHEAD MASTER RESISTANCE CHECK (TRBUSDT 3D Regression Test Fix)
        // Check if there is an unbroken higher descending line passing above this line
        // originating from any higher peak (like the all-time peak 67.9 in TRB).
        // If an overhead line from a higher peak sits above current price and has not broken,
        // this candidate line is an internal sub-trend and must be rejected!
        let hasOverheadUnbrokenMaster = false;
        for (let op = 0; op < pivots.length; op++) {
          const higherPivot = pivots[op];
          if (higherPivot.high <= pivot1.high * 1.05) continue;
          if (higherPivot.index >= pair.currIdx - 20) continue;

          // Check if higherPivot forms an unbroken resistance line with any subsequent peak
          for (let op2 = op + 1; op2 < pivots.length; op2++) {
            const higherPivot2 = pivots[op2];
            if (higherPivot2.high >= higherPivot.high) continue;
            if (higherPivot2.index >= pair.prevIdx) continue;
            const hSpan = higherPivot2.index - higherPivot.index;
            if (hSpan < 10) continue;

            const hSlope = (higherPivot2.high - higherPivot.high) / hSpan;
            const hLineAtCurr = higherPivot.high + hSlope * (pair.currIdx - higherPivot.index);

            // If the higher line is currently ABOVE price and was unbroken
            if (hLineAtCurr > currCandle.close) {
              let hViolations = 0;
              for (let hi = higherPivot.index; hi <= pair.currIdx; hi++) {
                const hy = higherPivot.high + hSlope * (hi - higherPivot.index);
                if (candles[hi].close > hy * 1.015) {
                  hViolations++;
                }
              }
              if (hViolations <= 1) {
                // There is a higher, unbroken master trendline above current price!
                hasOverheadUnbrokenMaster = true;
                break;
              }
            }
          }
          if (hasOverheadUnbrokenMaster) break;
        }

        if (hasOverheadUnbrokenMaster) {
          continue; // REJECT secondary sub-trend!
        }

        // RULE 3, 4, 8: AT LEAST 3 MAJOR TOUCHES WITH LOWER HIGH & REJECTION
        const rawTouches: Array<{
          index: number;
          time: number;
          high: number;
          price: number;
          rejectionPct: number;
        }> = [];

        for (let i = pivot1.index; i <= pair.prevIdx; i++) {
          const lineY = lineFormula(i);
          const c = candles[i];
          const barAtr = atrs[i] || c.close * 0.03;

          // Wick reached near the line
          const diff = Math.abs(c.high - lineY);
          const isTouch = diff <= 0.45 * barAtr || (c.high >= lineY * 0.985 && c.high <= lineY * 1.012);
          const respectedResistance = c.close <= lineY + 0.15 * barAtr;

          if (isTouch && respectedResistance) {
            // RULE 8: Check for downward rejection in the subsequent 3 to 10 bars
            let maxPostDrop = 0;
            const lookForward = Math.min(pair.prevIdx, i + 8);
            for (let f = i + 1; f <= lookForward; f++) {
              const drop = (c.high - candles[f].low) / c.high;
              if (drop > maxPostDrop) {
                maxPostDrop = drop;
              }
            }

            // Must have shown downward rejection of at least 2.5% (or 1.5x ATR)
            // (Only for historical touches, not the one immediately preceding breakout)
            const isJustBeforeBreakout = i >= pair.prevIdx - 2;
            if (maxPostDrop >= 0.025 || maxPostDrop * c.high >= 1.5 * barAtr || isJustBeforeBreakout) {
              rawTouches.push({
                index: i,
                time: c.time,
                high: c.high,
                price: lineY,
                rejectionPct: maxPostDrop * 100,
              });
            }
          }
        }

        // CLUSTERING (Rule 1 & 3): Group touches within 10 bars into 1 structural touch
        const clusteredTouches: TrendTouch[] = [];
        let currentCluster: typeof rawTouches = [];

        for (const t of rawTouches) {
          if (currentCluster.length === 0) {
            currentCluster.push(t);
          } else {
            const prevT = currentCluster[currentCluster.length - 1];
            if (t.index - prevT.index <= 10) {
              currentCluster.push(t);
            } else {
              // Pick best touch in cluster
              const bestInCluster = currentCluster.reduce((a, b) =>
                a.high > b.high ? a : b
              );
              clusteredTouches.push({
                index: bestInCluster.index,
                time: bestInCluster.time,
                dateStr: formatDate(bestInCluster.time),
                price: bestInCluster.price,
                candleHigh: bestInCluster.high,
                rejectionPct: bestInCluster.rejectionPct,
              });
              currentCluster = [t];
            }
          }
        }

        if (currentCluster.length > 0) {
          const bestInCluster = currentCluster.reduce((a, b) =>
            a.high > b.high ? a : b
          );
          clusteredTouches.push({
            index: bestInCluster.index,
            time: bestInCluster.time,
            dateStr: formatDate(bestInCluster.time),
            price: bestInCluster.price,
            candleHigh: bestInCluster.high,
            rejectionPct: bestInCluster.rejectionPct,
          });
        }

        // RULE 3: MANDATORY MINIMUM 3 MAJOR TOUCHES
        if (clusteredTouches.length < 3) {
          continue;
        }

        // RULE 4: STRUCTURAL LOWER HIGH VERIFICATION ACROSS TOUCHES
        // Touch1 > Touch2 > Touch3
        let isStrictLowerHigh = true;
        for (let t = 1; t < clusteredTouches.length; t++) {
          if (clusteredTouches[t].candleHigh >= clusteredTouches[t - 1].candleHigh) {
            isStrictLowerHigh = false;
            break;
          }
        }

        if (!isStrictLowerHigh) {
          continue;
        }

        // Check touch distribution (no empty void of > 75% between touches)
        let maxVoidBars = 0;
        for (let t = 1; t < clusteredTouches.length; t++) {
          const gap = clusteredTouches[t].index - clusteredTouches[t - 1].index;
          if (gap > maxVoidBars) maxVoidBars = gap;
        }
        if (maxVoidBars > trendAgeBars * 0.72) {
          continue; // Touches were not well-distributed across the trend structure
        }

        // SİNYAL KURALI (RULE 11 & 12):
        // 1. Önceki KAPANMIŞ mum trend çizgisinin altında olmalı:
        const prevClosedBelow = prevCandle.close <= lineAtPrev + 0.05 * currAtr;

        // 2. Son KAPANMIŞ mum trend çizgisinin NET şekilde üzerinde kapanmalı:
        const currClosedAbove = currCandle.close > lineAtCurr + breakoutBuffer;

        // RETEST CHECK (RULE 15):
        // Did it break out 1-4 bars ago, retest line from above as support, and bounce?
        let isRetestConfirmed = false;
        if (!currClosedAbove || !prevClosedBelow) {
          // Check for retest setup on recent candles
          if (pair.currIdx >= 3) {
            const breakBarIdx = pair.currIdx - 1;
            const breakLineY = lineFormula(breakBarIdx);
            const prevBreakLineY = lineFormula(breakBarIdx - 1);

            const brokeEarlier =
              candles[breakBarIdx].close > breakLineY + breakoutBuffer &&
              candles[breakBarIdx - 1].close <= prevBreakLineY;

            // Retest candle touches line from above and holds as support
            const retestedLine =
              currCandle.low <= lineAtCurr + 0.45 * currAtr &&
              currCandle.close >= lineAtCurr - 0.1 * currAtr &&
              currCandle.close >= currCandle.open; // Green bounce candle

            if (brokeEarlier && retestedLine) {
              isRetestConfirmed = true;
            }
          }
        }

        // Neither fresh breakout nor verified retest
        if (!isRetestConfirmed && (!prevClosedBelow || !currClosedAbove)) {
          continue;
        }

        // VOLUME CONFIRMATION (RULE 13):
        const volumeRatio = currCandle.volume / avgVol20;
        const isHighVolume = volumeRatio >= 1.5;

        // Determine exact signal label (RULE 13, 14, 15, 18)
        let signalName: BreakoutSignalType = '🔥 MAJÖR DÜŞEN TREND KIRILDI';
        if (isRetestConfirmed) {
          signalName = '✅ RETEST ONAYLI MAJÖR KIRILIM';
        } else if (isHighVolume) {
          signalName = '🔥 HACİMLİ MAJÖR KIRILIM';
        }

        // Unique ID for deduplication (RULE 16)
        const touchTimestamps = clusteredTouches.map((t) => t.time).join('_');
        const uniqueId = `${exchange}_${symbol}_${timeframe}_${touchTimestamps}_${currCandle.time}`;

        // Trend quality score (cleaner resistance, lower violations, more touches)
        const qualityScore =
          clusteredTouches.length * 20 +
          (totalDropPct * 100) +
          (isHighVolume ? 15 : 0) +
          (isRetestConfirmed ? 25 : 0) -
          (violationCloses * 30);

        if (qualityScore > bestQualityScore) {
          bestQualityScore = qualityScore;

          const targets = calculateTargets(
            candles,
            clusteredTouches,
            pivot1.high,
            currCandle.close,
            lineAtCurr,
            candles[candles.length - 1]?.close
          );

          bestSignal = {
            symbol,
            exchange,
            timeframe,
            signalName,
            signalType: signalName,
            trendAgeDays,
            trendAgeBars,
            majorTouchCount: clusteredTouches.length,
            breakoutPrice: currCandle.close,
            currentPrice: targets.currentPrice,
            tp1: targets.tp1,
            tp2: targets.tp2,
            sl: targets.sl,
            tp1Ratio: targets.tp1Ratio,
            tp2Ratio: targets.tp2Ratio,
            fibLevels: targets.fibLevels,
            breakoutTime: currCandle.time,
            breakoutTimeStr: formatDateTime(currCandle.time),
            trendlinePriceAtBreakout: lineAtCurr,
            startPrice: pivot1.high,
            startDateStr: formatDate(pivot1.time),
            touches: clusteredTouches,
            klines: candles,
            lineFormula,
            volume24hUsd,
            change24h,
            volumeRatio,
            isHighVolume,
            isRetest: isRetestConfirmed,
            uniqueId,
          };
        }
      }
    }
  }

  return bestSignal;
}
