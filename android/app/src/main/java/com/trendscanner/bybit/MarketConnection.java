package com.trendscanner.bybit;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * MarketConnection Plugin
 * Capacitor native bridge for crypto exchange network requests.
 * Features deep diagnostic logging to Logcat and structured reporting to UI.
 */
@CapacitorPlugin(name = "MarketConnection")
public class MarketConnection extends Plugin {

    private static final String TAG = "TRADINGLY_NET";
    private final ExecutorService executor = Executors.newFixedThreadPool(8);

    @PluginMethod
    public void request(PluginCall call) {
        handleFetch(call);
    }

    @PluginMethod
    public void fetch(PluginCall call) {
        handleFetch(call);
    }

    private void handleFetch(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("URL parameter is required");
            return;
        }

        String method = call.getString("method", "GET").toUpperCase();
        String body = call.getString("body", null);
        Integer timeout = call.getInt("timeout", 15000);

        Map<String, String> customHeaders = new HashMap<>();
        JSObject headersObj = call.getObject("headers");
        if (headersObj != null) {
            Iterator<String> keys = headersObj.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                customHeaders.put(key, headersObj.getString(key));
            }
        }

        executor.execute(() -> {
            try {
                MarketTransport.Response response;
                if ("POST".equalsIgnoreCase(method)) {
                    response = MarketTransport.post(url, body, customHeaders, timeout);
                } else {
                    response = MarketTransport.get(url, customHeaders, timeout);
                }

                JSObject ret = new JSObject();
                ret.put("status", response.statusCode);
                ret.put("data", response.body);
                ret.put("ok", response.isSuccessful);
                ret.put("usedUrl", response.usedUrl);
                ret.put("trace", response.diagnosticTrace);
                if (!response.isSuccessful) {
                    ret.put("error", response.error);
                }
                call.resolve(ret);
            } catch (Exception e) {
                String detailedErr = MarketTransport.formatDetailedException(e);
                Log.e(TAG, "Unhandled exception in handleFetch for " + url + ": " + detailedErr, e);

                JSObject ret = new JSObject();
                ret.put("status", 0);
                ret.put("data", "");
                ret.put("ok", false);
                ret.put("error", detailedErr);
                ret.put("usedUrl", url);
                ret.put("trace", Log.getStackTraceString(e));
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void checkConnection(PluginCall call) {
        executor.execute(() -> {
            MarketTransport.Response bybitResp = MarketTransport.get("https://api.bytick.com/v5/market/time", null, 8000);
            MarketTransport.Response binanceResp = MarketTransport.get("https://fapi.binance.com/fapi/v1/time", null, 8000);
            MarketTransport.Response okxResp = MarketTransport.get("https://www.okx.com/api/v5/public/time", null, 8000);

            JSObject ret = new JSObject();
            ret.put("bybitOk", bybitResp.isSuccessful);
            ret.put("bybitUrl", bybitResp.usedUrl);
            ret.put("bybitError", bybitResp.error);
            ret.put("bybitTrace", bybitResp.diagnosticTrace);

            ret.put("binanceOk", binanceResp.isSuccessful);
            ret.put("binanceUrl", binanceResp.usedUrl);
            ret.put("binanceError", binanceResp.error);
            ret.put("binanceTrace", binanceResp.diagnosticTrace);

            ret.put("okxOk", okxResp.isSuccessful);
            ret.put("okxUrl", okxResp.usedUrl);
            ret.put("okxError", okxResp.error);
            ret.put("okxTrace", okxResp.diagnosticTrace);

            call.resolve(ret);
        });
    }

    /**
     * Deep diagnostic inspection of OS network permissions, active connectivity,
     * and phase-by-phase connection to Bybit, Binance and OKX.
     */
    @PluginMethod
    public void runDiagnostic(PluginCall call) {
        executor.execute(() -> {
            StringBuilder report = new StringBuilder();
            report.append("=== TRADINGLY ANDROID NETWORK DIAGNOSTIC REPORT ===\n\n");

            Context ctx = getContext();

            // 1. Android Permission Checks
            boolean hasInternet = ctx.checkCallingOrSelfPermission(Manifest.permission.INTERNET) == PackageManager.PERMISSION_GRANTED;
            boolean hasNetState = ctx.checkCallingOrSelfPermission(Manifest.permission.ACCESS_NETWORK_STATE) == PackageManager.PERMISSION_GRANTED;

            report.append("[PERMISSION] android.permission.INTERNET: ").append(hasInternet ? "GRANTED (OK)" : "DENIED (CRITICAL ERROR)")
                  .append("\n[PERMISSION] android.permission.ACCESS_NETWORK_STATE: ").append(hasNetState ? "GRANTED (OK)" : "DENIED")
                  .append("\n\n");

            // 2. Connectivity Manager State
            try {
                ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) {
                    NetworkInfo activeInfo = cm.getActiveNetworkInfo();
                    if (activeInfo != null) {
                        report.append("[NETWORK STATE] Connected: ").append(activeInfo.isConnected())
                              .append(" | Available: ").append(activeInfo.isAvailable())
                              .append(" | Type: ").append(activeInfo.getTypeName())
                              .append(" | Subtype: ").append(activeInfo.getSubtypeName())
                              .append(" | ExtraInfo: ").append(activeInfo.getExtraInfo())
                              .append("\n\n");
                    } else {
                        report.append("[NETWORK STATE] No active network info (Device appears OFFLINE)\n\n");
                    }
                }
            } catch (Throwable t) {
                report.append("[NETWORK STATE] Check error: ").append(t.getMessage()).append("\n\n");
            }

            // 3. Probing Exchange Endpoints
            report.append(MarketTransport.probeEndpoint("api.bytick.com", 443)).append("\n");
            report.append(MarketTransport.probeEndpoint("api.bybit.com", 443)).append("\n");
            report.append(MarketTransport.probeEndpoint("fapi.binance.com", 443)).append("\n");
            report.append(MarketTransport.probeEndpoint("www.okx.com", 443)).append("\n");

            String fullReport = report.toString();
            Log.i(TAG, fullReport);

            JSObject ret = new JSObject();
            ret.put("report", fullReport);
            ret.put("hasInternetPermission", hasInternet);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("pluginLoaded", true);
        ret.put("trialUnlocked", TrialPolicy.isFeatureUnlocked());
        ret.put("statusDescription", TrialPolicy.getStatusDescription());
        call.resolve(ret);
    }
}
