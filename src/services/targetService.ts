import { KlineCandle, TrendTouch, FibLevels } from '../types/scanner';

export interface CalculatedTargets {
  currentPrice: number;
  tp1: number;
  tp2: number;
  sl: number;
  tp1Ratio: number;
  tp2Ratio: number;
  fibLevels: FibLevels;
}

/**
 * Calculate structural TP1, TP2, and SL based on:
 * 1. Current Price (Anlık Fiyat)
 * 2. Fibonacci levels across the major swing structure
 * 3. Long timeframe (HTF) horizontal resistances & swing high touches
 * 4. Structural invalidation support for Stop Loss
 * 5. Confluence between Fib and HTF resistance
 */
export function calculateTargets(
  candles: KlineCandle[],
  touches: TrendTouch[],
  startPrice: number, // Anchor 1 high
  breakoutPrice: number,
  linePriceAtBreakout: number,
  liveTickerPrice?: number
): CalculatedTargets {
  const n = candles.length;
  // 1. ANLIK FİYAT (Live Price)
  const currentPrice = liveTickerPrice && liveTickerPrice > 0
    ? liveTickerPrice
    : candles[n - 1].close || breakoutPrice;

  // Compute local ATR for buffer calculations
  let atrSum = 0;
  const atrPeriod = Math.min(14, n - 1);
  for (let i = n - atrPeriod; i < n; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    atrSum += tr;
  }
  const atr = atrSum / atrPeriod || currentPrice * 0.03;

  // 2. FIBONACCI FROM MAJOR PRICE STRUCTURE
  // Major swing high: Anchor 1 of the broken trend (or the highest high of the dataset)
  let swingHigh = startPrice;
  for (const t of touches) {
    if (t.candleHigh > swingHigh) swingHigh = t.candleHigh;
  }

  // Major swing low: The lowest low reached during the bear market prior to breakout
  let swingLow = currentPrice;
  // Look across candles from Anchor 1 to breakout
  const firstTouchIdx = touches[0]?.index || 0;
  for (let i = firstTouchIdx; i < n; i++) {
    if (candles[i].low < swingLow) {
      swingLow = candles[i].low;
    }
  }

  // Ensure positive range
  const fibRange = Math.max(swingHigh - swingLow, currentPrice * 0.05);

  const fib0382 = swingLow + 0.382 * fibRange;
  const fib0500 = swingLow + 0.500 * fibRange;
  const fib0618 = swingLow + 0.618 * fibRange;
  const fib0786 = swingLow + 0.786 * fibRange;
  const fib1000 = swingHigh;
  const fib1272 = swingLow + 1.272 * fibRange;
  const fib1618 = swingLow + 1.618 * fibRange;

  const fibLevels: FibLevels = {
    fib0382,
    fib0500,
    fib0618,
    fib0786,
    fib1000,
    swingHigh,
    swingLow,
  };

  // 3. HTF RESISTANCES & MAJOR SWING HIGHS
  // The historical touches of the trendline are proven major resistance levels!
  const htfResistances: number[] = [];
  for (const t of touches) {
    if (t.candleHigh > currentPrice * 1.01) {
      htfResistances.push(t.candleHigh);
    }
  }
  // Also collect other major horizontal reaction peaks
  for (let i = firstTouchIdx; i < n - 3; i++) {
    const c = candles[i];
    if (c.high > currentPrice * 1.02 && c.high < swingHigh * 1.01) {
      // Is a local high
      if (c.high > candles[i - 1].high && c.high > candles[i + 1].high) {
        htfResistances.push(c.high);
      }
    }
  }

  // 4. CONFLUENCE TARGET EVALUATION
  // Candidate target levels from Fib
  const candidateFibs = [fib0382, fib0500, fib0618, fib0786, fib1000, fib1272, fib1618].filter(
    (lvl) => lvl > currentPrice * 1.025
  );

  // Score candidate levels by proximity to HTF resistance
  const scoredTargets: Array<{ price: number; score: number }> = [];

  for (const fibLvl of candidateFibs) {
    let score = 10;
    let closestHtf = fibLvl;
    let minDiff = Infinity;

    for (const htf of htfResistances) {
      const diffPct = Math.abs(htf - fibLvl) / fibLvl;
      if (diffPct < minDiff) {
        minDiff = diffPct;
        closestHtf = htf;
      }
    }

    if (minDiff <= 0.04) {
      // Strong confluence (within 4%): average them into a confluence zone center
      score += 25;
      const confluencePrice = (fibLvl + closestHtf) / 2;
      scoredTargets.push({ price: confluencePrice, score });
    } else {
      scoredTargets.push({ price: fibLvl, score });
    }
  }

  // Also include isolated HTF resistances if they are distinct
  for (const htf of htfResistances) {
    if (htf > currentPrice * 1.03) {
      const isAlreadyCovered = scoredTargets.some(
        (st) => Math.abs(st.price - htf) / htf < 0.03
      );
      if (!isAlreadyCovered) {
        scoredTargets.push({ price: htf, score: 15 });
      }
    }
  }

  // Sort ascending by price
  scoredTargets.sort((a, b) => a.price - b.price);

  // 5. DETERMINE TP1
  // First meaningful major target above current price
  // Must be at least 2.5% or 1.5x ATR above current price
  const minTp1Distance = Math.max(currentPrice * 0.025, 1.5 * atr);
  let selectedTp1 = currentPrice + minTp1Distance;

  for (const t of scoredTargets) {
    if (t.price >= currentPrice + minTp1Distance) {
      selectedTp1 = t.price;
      break;
    }
  }

  // 6. DETERMINE TP2
  // Next major overhead target above TP1 (at least 6% or 2.5x ATR higher than TP1)
  const minTp2Distance = Math.max(selectedTp1 * 0.06, 2.5 * atr);
  let selectedTp2 = selectedTp1 + minTp2Distance;

  for (const t of scoredTargets) {
    if (t.price >= selectedTp1 + minTp2Distance) {
      selectedTp2 = t.price;
      break;
    }
  }

  // If no higher target found, project next Fib extension or swing high
  if (selectedTp2 <= selectedTp1) {
    selectedTp2 = Math.max(selectedTp1 * 1.15, fib0786, fib1000);
  }

  // 7. STOP LOSS (SL)
  // Market structure invalidation level:
  // Find the lowest swing low in the 5 to 15 bars immediately preceding the breakout
  const recentLookback = Math.min(15, n);
  let recentBaseLow = currentPrice;
  for (let i = n - recentLookback; i < n; i++) {
    if (candles[i].low < recentBaseLow) {
      recentBaseLow = candles[i].low;
    }
  }

  // Invalidation just below the breakout base swing low or below the broken trendline
  // Buffer: 0.25x ATR below structural low
  const structuralSl = recentBaseLow - 0.25 * atr;
  const trendlineSl = linePriceAtBreakout - 0.35 * atr;

  // Use the safer, tighter structural invalidation that stays below market structure
  let finalSl = Math.min(structuralSl, trendlineSl);

  // Safety checks: SL must be below current price and within realistic limits
  if (finalSl >= currentPrice * 0.995) {
    finalSl = currentPrice * 0.95; // 5% fallback if base is coincident with current
  }
  // Cap max distance at 25% to avoid absurd SLs on extreme wicks
  if (finalSl < currentPrice * 0.75) {
    finalSl = currentPrice * 0.85;
  }

  // 8. RISK / REWARD (R/R)
  const risk = Math.max(currentPrice - finalSl, currentPrice * 0.01);
  const reward1 = Math.max(selectedTp1 - currentPrice, 0);
  const reward2 = Math.max(selectedTp2 - currentPrice, 0);

  const tp1Ratio = Number((reward1 / risk).toFixed(2));
  const tp2Ratio = Number((reward2 / risk).toFixed(2));

  return {
    currentPrice: Number(currentPrice.toFixed(4)),
    tp1: Number(selectedTp1.toFixed(4)),
    tp2: Number(selectedTp2.toFixed(4)),
    sl: Number(finalSl.toFixed(4)),
    tp1Ratio,
    tp2Ratio,
    fibLevels,
  };
}
