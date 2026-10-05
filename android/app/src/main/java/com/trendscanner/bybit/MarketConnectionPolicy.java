package com.trendscanner.bybit;

import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.net.ssl.SSLException;

/**
 * MarketConnectionPolicy
 * Manages failover endpoints, default browser headers, timeouts, and error policies
 * to eliminate "Connection reset" errors on mobile networks and regional ISP firewalls.
 */
public class MarketConnectionPolicy {

    public static final int CONNECT_TIMEOUT_MS = 15000;
    public static final int READ_TIMEOUT_MS = 20000;

    // Realistic browser User-Agent to prevent Cloudflare/Akamai bot blocking
    public static final String DEFAULT_USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

    // Primary and official fallback mirror endpoints for each exchange
    public static final List<String> BYBIT_MIRRORS = Collections.unmodifiableList(Arrays.asList(
            "https://api.bytick.com", // Official global mirror for Turkey / restricted regions (highest reliability)
            "https://api.bybit.com",
            "https://api.bybit-global.com",
            "https://api.bybit.nl"
    ));

    public static final List<String> BINANCE_MIRRORS = Collections.unmodifiableList(Arrays.asList(
            "https://fapi.binance.com"
    ));

    public static final List<String> OKX_MIRRORS = Collections.unmodifiableList(Arrays.asList(
            "https://www.okx.com"
    ));

    /**
     * Standard headers required by crypto exchange endpoints.
     */
    public static Map<String, String> getStandardHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("User-Agent", DEFAULT_USER_AGENT);
        headers.put("Accept", "application/json, text/plain, */*");
        headers.put("Accept-Encoding", "gzip");
        headers.put("Cache-Control", "no-cache");
        return headers;
    }

    /**
     * Resolves all alternative mirror URLs for a given request URL.
     * Preserves exact path and query parameters while substituting the host.
     */
    public static List<String> getUrlCandidates(String requestedUrl) {
        List<String> candidates = new ArrayList<>();
        if (requestedUrl == null || requestedUrl.trim().isEmpty()) {
            return candidates;
        }

        requestedUrl = requestedUrl.trim();
        candidates.add(requestedUrl);

        // Detect exchange by domain and generate fallback URLs
        if (requestedUrl.contains("bybit.com") || requestedUrl.contains("bytick.com") || requestedUrl.contains("bybit.nl")) {
            for (String mirror : BYBIT_MIRRORS) {
                String alt = replaceHost(requestedUrl, mirror);
                if (!candidates.contains(alt)) {
                    candidates.add(alt);
                }
            }
        } else if (requestedUrl.contains("binance.com")) {
            for (String mirror : BINANCE_MIRRORS) {
                String alt = replaceHost(requestedUrl, mirror);
                if (!candidates.contains(alt)) {
                    candidates.add(alt);
                }
            }
        } else if (requestedUrl.contains("okx.com")) {
            for (String mirror : OKX_MIRRORS) {
                String alt = replaceHost(requestedUrl, mirror);
                if (!candidates.contains(alt)) {
                    candidates.add(alt);
                }
            }
        }

        return candidates;
    }

    /**
     * Replaces the scheme and host of a full URL with target base.
     */
    public static String replaceHost(String fullUrl, String newBase) {
        try {
            java.net.URI uri = new java.net.URI(fullUrl);
            java.net.URI baseUri = new java.net.URI(newBase);
            String rawPath = uri.getRawPath();
            String rawQuery = uri.getRawQuery();

            StringBuilder sb = new StringBuilder(newBase);
            if (rawPath != null && !rawPath.isEmpty()) {
                if (!newBase.endsWith("/") && !rawPath.startsWith("/")) {
                    sb.append("/");
                }
                sb.append(rawPath);
            }
            if (rawQuery != null && !rawQuery.isEmpty()) {
                sb.append("?").append(rawQuery);
            }
            return sb.toString();
        } catch (Exception e) {
            return fullUrl;
        }
    }

    /**
     * Identifies connection reset, TLS handshake failure, or network dropouts.
     */
    public static boolean isRetriableNetworkError(Throwable t) {
        if (t == null) return false;
        if (t instanceof SocketException ||
            t instanceof SocketTimeoutException ||
            t instanceof SSLException ||
            t instanceof UnknownHostException) {
            return true;
        }
        String msg = t.getMessage();
        if (msg != null) {
            String lower = msg.toLowerCase();
            return lower.contains("connection reset") ||
                   lower.contains("reset by peer") ||
                   lower.contains("broken pipe") ||
                   lower.contains("timeout") ||
                   lower.contains("handshake failed") ||
                   lower.contains("network unreachable");
        }
        return false;
    }
}
