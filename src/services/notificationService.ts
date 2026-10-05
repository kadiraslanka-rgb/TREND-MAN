import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { MajorBreakoutSignal } from '../types/scanner';

const STORAGE_NOTIFIED_KEY = 'bybit_trend_notified_signals_v2';
const CHANNEL_ID = 'major_breakouts';

export interface NotificationActionPayload {
  symbol: string;
  timeframe: string;
}

/**
 * Get the set of already notified signal IDs
 */
function getNotifiedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_NOTIFIED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/**
 * Save a newly notified signal ID
 */
function markAsNotified(key: string): void {
  try {
    const set = getNotifiedSet();
    set.add(key);
    const arr = Array.from(set).slice(-1000);
    localStorage.setItem(STORAGE_NOTIFIED_KEY, JSON.stringify(arr));
  } catch (e) {
    console.error('Failed to save notified key:', e);
  }
}

/**
 * Check if this exact breakout signal was already notified
 */
export function isSignalAlreadyNotified(signal: MajorBreakoutSignal): boolean {
  const signalKey = `${signal.uniqueId}_${signal.isRetest ? 'retest' : 'initial'}`;
  return getNotifiedSet().has(signalKey);
}

/**
 * Initialize notification channels and listeners
 */
export async function initNotificationService(
  onNotificationClick?: (payload: NotificationActionPayload) => void
): Promise<boolean> {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      const permStatus = await LocalNotifications.checkPermissions();
      if (permStatus.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== 'granted') {
          console.warn('Android notification permission not granted');
        }
      }

      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Majör Trend Kırılım Sinyalleri',
        description: 'Uzun vadeli düşen majör trend kırılımlarında anında bildirim gönderir.',
        importance: 5, // High importance
        visibility: 1, // Public on lockscreen
        sound: 'beep.wav',
        vibration: true,
        lights: true,
        lightColor: '#10B981',
      });

      LocalNotifications.removeAllListeners();
      await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const extra = action.notification.extra as NotificationActionPayload | undefined;
        if (extra?.symbol && onNotificationClick) {
          onNotificationClick(extra);
        }
      });

      return true;
    } catch (err) {
      console.error('Capacitor notifications init error:', err);
      return false;
    }
  } else {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // Ignore
      }
    }
    return true;
  }
}

/**
 * Send an Android or Web notification for a verified Major Trend Breakout.
 *
 * Rules:
 * 1. Initial breakout:
 *    🔥 MAJÖR DÜŞEN TREND KIRILDI (or 🔥 HACİMLİ MAJÖR KIRILIM)
 *    VIRTUALUSDT • 1D
 *    Uzun vadeli düşen trend yukarı kırıldı.
 *    Kırılım: $0.7818
 * 2. Retest confirmation:
 *    ✅ RETEST ONAYLI MAJÖR KIRILIM
 *    VIRTUALUSDT • 1D
 *    Düşen trend desteği test edildi ve yukarı tepki verdi.
 *    Fiyat: $0.7818
 * 3. Deduplication:
 *    Only 1 notification per unique trend breakout.
 */
export async function sendBreakoutNotification(signal: MajorBreakoutSignal): Promise<boolean> {
  const signalKey = `${signal.uniqueId}_${signal.isRetest ? 'retest' : 'initial'}`;

  // Rule 16: Tekrar bildirim engelleme
  if (getNotifiedSet().has(signalKey)) {
    return false;
  }

  const title = signal.signalName;
  const body = `${signal.symbol} • ${signal.timeframe}\nAnlık: $${signal.currentPrice.toFixed(4)}\nTP1: $${signal.tp1.toFixed(4)}\nTP2: $${signal.tp2.toFixed(4)}\nSL: $${signal.sl.toFixed(4)}\nTP1 R/R: ${signal.tp1Ratio}\nTP2 R/R: ${signal.tp2Ratio}`;

  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      const notifId = Math.abs(
        signal.uniqueId.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
      ) % 100000;

      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: notifId,
            channelId: CHANNEL_ID,
            schedule: { at: new Date(Date.now() + 100) },
            sound: 'beep.wav',
            smallIcon: 'ic_stat_name',
            actionTypeId: 'OPEN_CHART',
            extra: {
              symbol: signal.symbol,
              timeframe: signal.timeframe,
              breakoutPrice: signal.breakoutPrice,
              breakoutTime: signal.breakoutTime,
            },
          },
        ],
      });

      markAsNotified(signalKey);
      return true;
    } catch (err) {
      console.error('Failed to schedule native local notification:', err);
      return false;
    }
  } else {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: signalKey,
        });

        notif.onclick = () => {
          window.focus();
        };

        markAsNotified(signalKey);
        return true;
      } catch (err) {
        console.error('Web notification error:', err);
      }
    }
    markAsNotified(signalKey);
    return false;
  }
}
