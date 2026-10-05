import { registerPlugin, Capacitor } from '@capacitor/core';

export interface MarketConnectionPlugin {
  request(options: {
    url: string;
    method?: string;
    body?: string | null;
    headers?: Record<string, string>;
    timeout?: number;
    exchange?: string;
  }): Promise<{
    status: number;
    data: string;
    ok: boolean;
    usedUrl?: string;
    error?: string;
  }>;

  fetch(options: {
    url: string;
    method?: string;
    body?: string | null;
    headers?: Record<string, string>;
    timeout?: number;
    exchange?: string;
  }): Promise<{
    status: number;
    data: string;
    ok: boolean;
    usedUrl?: string;
    error?: string;
  }>;

  checkConnection(): Promise<{
    bybitOk: boolean;
    bybitUrl: string;
    bybitError?: string;
    binanceOk: boolean;
    binanceUrl: string;
    binanceError?: string;
    okxOk: boolean;
    okxUrl: string;
    okxError?: string;
  }>;

  getStatus(): Promise<{
    pluginLoaded: boolean;
    trialUnlocked: boolean;
    statusDescription: string;
  }>;

  runDiagnostic(): Promise<{
    report: string;
    hasInternetPermission: boolean;
  }>;
}

// Register the Capacitor native plugin bridge for Android
export const MarketConnection = registerPlugin<MarketConnectionPlugin>('MarketConnection');

export async function runDiagnosticReport(): Promise<string> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('MarketConnection')) {
    try {
      const res = await MarketConnection.runDiagnostic();
      return res.report;
    } catch (err: any) {
      return `Tanılama çalıştırılamadı: ${err?.message || String(err)}`;
    }
  }
  return 'Web geliştirme ortamındasınız. Bu derin ağ tanılama testi Android APK üzerinde çalıştırılmalıdır.';
}

/**
 * Universal HTTP client:
 * - Uses native MarketConnection plugin on Android (bypasses WebView CORS & Connection Reset via mirror failover)
 * - Uses standard fetch on Web / Vite dev environment
 */
export async function executeMarketRequest(
  url: string,
  options: {
    method?: string;
    body?: string | null;
    headers?: Record<string, string>;
    timeout?: number;
    exchange?: 'bybit' | 'binance' | 'okx';
  } = {}
): Promise<{ status: number; text: string; ok: boolean; usedUrl: string }> {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      const result = await MarketConnection.request({
        url,
        method: options.method || 'GET',
        body: options.body || null,
        headers: options.headers || {},
        timeout: options.timeout || 15000,
        exchange: options.exchange,
      });

      if (!result.ok && !result.data) {
        throw new Error(result.error || `Bağlantı hatası (HTTP ${result.status})`);
      }

      return {
        status: result.status,
        text: result.data,
        ok: result.ok,
        usedUrl: result.usedUrl || url,
      };
    } catch (pluginErr: any) {
      // On native Android, NEVER fall back to WebView fetch() if MarketConnection is registered.
      // Calling fetch() inside Android WebView causes CORS and Connection reset errors.
      if (Capacitor.isPluginAvailable('MarketConnection')) {
        throw new Error(pluginErr?.message || String(pluginErr));
      }
      console.warn('MarketConnection native plugin not available, attempting web fetch fallback:', pluginErr);
    }
  }

  // Web / fallback fetch
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 15000);

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body,
      signal: controller.signal,
    });

    const text = await res.text();
    return {
      status: res.status,
      text,
      ok: res.ok,
      usedUrl: url,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`İstek zaman aşımına uğradı (${(options.timeout || 15000) / 1000}s): ${url}`);
    }
    throw new Error(`Ağ hatası: ${err.message || String(err)}`);
  } finally {
    clearTimeout(timeoutId);
  }
}
