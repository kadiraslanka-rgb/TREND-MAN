package com.trendscanner.bybit;

import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPInputStream;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * MarketTransport
 * Robust HTTP/HTTPS client with deep diagnostic tracing and Android logging.
 * Never disables TLS certificate verification.
 */
public class MarketTransport {

    private static final String TAG = "TRADINGLY_NET";

    public static class Response {
        public int statusCode;
        public String body;
        public boolean isSuccessful;
        public String error;
        public String usedUrl;
        public String diagnosticTrace;

        public Response(int statusCode, String body, boolean isSuccessful, String error, String usedUrl, String diagnosticTrace) {
            this.statusCode = statusCode;
            this.body = body != null ? body : "";
            this.isSuccessful = isSuccessful;
            this.error = error != null ? error : "";
            this.usedUrl = usedUrl != null ? usedUrl : "";
            this.diagnosticTrace = diagnosticTrace != null ? diagnosticTrace : "";
        }
    }

    public static Response get(String requestedUrl, Map<String, String> customHeaders, int timeoutMs) {
        return executeWithFailover(requestedUrl, "GET", null, customHeaders, timeoutMs);
    }

    public static Response post(String requestedUrl, String postBody, Map<String, String> customHeaders, int timeoutMs) {
        return executeWithFailover(requestedUrl, "POST", postBody, customHeaders, timeoutMs);
    }

    /**
     * Executes request against candidate mirror URLs, capturing full stage diagnostics.
     */
    public static Response executeWithFailover(
            String requestedUrl,
            String method,
            String postBody,
            Map<String, String> customHeaders,
            int timeoutMs) {

        List<String> candidates = MarketConnectionPolicy.getUrlCandidates(requestedUrl);
        if (candidates.isEmpty()) {
            return new Response(0, "", false, "Invalid URL: " + requestedUrl, requestedUrl, "No candidate URLs");
        }

        int connectTimeout = timeoutMs > 0 ? timeoutMs : MarketConnectionPolicy.CONNECT_TIMEOUT_MS;
        int readTimeout = timeoutMs > 0 ? timeoutMs : MarketConnectionPolicy.READ_TIMEOUT_MS;

        StringBuilder traceLog = new StringBuilder();
        traceLog.append("Requested: ").append(requestedUrl).append(" | Candidates: ").append(candidates.size()).append("\n");

        Exception lastException = null;
        Response lastResponse = null;

        for (int i = 0; i < candidates.size(); i++) {
            String targetUrl = candidates.get(i);
            traceLog.append("[").append(i + 1).append("/").append(candidates.size()).append("] ").append(targetUrl).append(" -> ");

            try {
                Response resp = executeSingleRequest(targetUrl, method, postBody, customHeaders, connectTimeout, readTimeout);
                if (resp.isSuccessful) {
                    traceLog.append("SUCCESS (HTTP ").append(resp.statusCode).append(")\n");
                    resp.diagnosticTrace = traceLog.toString();
                    Log.i(TAG, "Request successful: " + targetUrl);
                    return resp;
                }

                lastResponse = resp;
                traceLog.append("FAIL HTTP ").append(resp.statusCode).append(": ").append(resp.error).append("\n");
                Log.w(TAG, "Candidate returned non-success: " + targetUrl + " -> HTTP " + resp.statusCode + " (" + resp.error + ")");

                // Non-retriable client errors (e.g. 400 Bad Request, 404 Not Found)
                if (resp.statusCode >= 400 && resp.statusCode < 500 && resp.statusCode != 403 && resp.statusCode != 429) {
                    resp.diagnosticTrace = traceLog.toString();
                    return resp;
                }
            } catch (Exception e) {
                lastException = e;
                String detailedErr = formatDetailedException(e);
                traceLog.append("EXCEPTION: ").append(detailedErr).append("\n");

                Log.e(TAG, "Error on candidate " + targetUrl + ": " + detailedErr, e);

                if (!MarketConnectionPolicy.isRetriableNetworkError(e)) {
                    String fullTrace = traceLog.toString();
                    return new Response(0, "", false, detailedErr, targetUrl, fullTrace);
                }
            }
        }

        if (lastResponse != null) {
            lastResponse.diagnosticTrace = traceLog.toString();
            return lastResponse;
        }

        String errMessage = lastException != null ? formatDetailedException(lastException) : "All connection attempts failed";
        return new Response(0, "", false, errMessage, requestedUrl, traceLog.toString());
    }

    private static Response executeSingleRequest(
            String urlStr,
            String method,
            String postBody,
            Map<String, String> customHeaders,
            int connectTimeout,
            int readTimeout) throws Exception {

        try {
            return doHttpExchange(urlStr, method, postBody, customHeaders, connectTimeout, readTimeout, false);
        } catch (Exception e) {
            if (MarketConnectionPolicy.isRetriableNetworkError(e)) {
                Log.w(TAG, "Retrying " + urlStr + " with Connection: close due to: " + e.getClass().getSimpleName() + " (" + e.getMessage() + ")");
                return doHttpExchange(urlStr, method, postBody, customHeaders, connectTimeout, readTimeout, true);
            }
            throw e;
        }
    }

    private static Response doHttpExchange(
            String urlStr,
            String method,
            String postBody,
            Map<String, String> customHeaders,
            int connectTimeout,
            int readTimeout,
            boolean forceClose) throws Exception {

        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();

        try {
            conn.setRequestMethod(method);
            conn.setConnectTimeout(connectTimeout);
            conn.setReadTimeout(readTimeout);
            conn.setInstanceFollowRedirects(true);
            conn.setUseCaches(false);

            if (forceClose) {
                conn.setRequestProperty("Connection", "close");
            }

            Map<String, String> stdHeaders = MarketConnectionPolicy.getStandardHeaders();
            for (Map.Entry<String, String> entry : stdHeaders.entrySet()) {
                conn.setRequestProperty(entry.getKey(), entry.getValue());
            }

            if (customHeaders != null) {
                for (Map.Entry<String, String> entry : customHeaders.entrySet()) {
                    conn.setRequestProperty(entry.getKey(), entry.getValue());
                }
            }

            if ("POST".equalsIgnoreCase(method) && postBody != null) {
                conn.setDoOutput(true);
                byte[] bytes = postBody.getBytes(StandardCharsets.UTF_8);
                conn.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bytes);
                    os.flush();
                }
            }

            int statusCode = conn.getResponseCode();
            String contentType = conn.getContentType();
            boolean isHtml = contentType != null && (contentType.toLowerCase().contains("text/html") || contentType.toLowerCase().contains("application/xhtml"));
            boolean isSuccess = (statusCode >= 200 && statusCode < 300) && !isHtml;

            InputStream is = isSuccess ? conn.getInputStream() : conn.getErrorStream();
            String responseBody = "";

            if (is != null) {
                String encoding = conn.getHeaderField("Content-Encoding");
                if (encoding != null && encoding.toLowerCase().contains("gzip")) {
                    try {
                        is = new GZIPInputStream(is);
                    } catch (Exception ignored) {
                    }
                }

                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] data = new byte[8192];
                int nRead;
                while ((nRead = is.read(data, 0, data.length)) != -1) {
                    buffer.write(data, 0, nRead);
                }
                buffer.flush();
                responseBody = buffer.toString("UTF-8");
            }

            String errorMsg = null;
            if (!isSuccess) {
                if (isHtml) {
                    errorMsg = "API returned unexpected HTML (redirect or block): " + urlStr;
                } else {
                    errorMsg = "HTTP " + statusCode + (responseBody.length() > 0 ? " (" + responseBody.substring(0, Math.min(120, responseBody.length())) + ")" : "");
                }
            }

            return new Response(statusCode, responseBody, isSuccess, errorMsg, urlStr, "");
        } finally {
            conn.disconnect();
        }
    }

    /**
     * Diagnostic probe to test DNS, TCP socket, and TLS handshake individually.
     * Pinpoints the EXACT point of network failure.
     */
    public static String probeEndpoint(String host, int port) {
        StringBuilder sb = new StringBuilder();
        sb.append("=== DIAGNOSTIC PROBE FOR ").append(host).append(":").append(port).append(" ===\n");

        InetAddress targetIp = null;

        // Stage 1: DNS Resolution
        long tDns = System.currentTimeMillis();
        try {
            InetAddress[] addrs = InetAddress.getAllByName(host);
            long dDns = System.currentTimeMillis() - tDns;
            List<String> ipList = new ArrayList<>();
            for (InetAddress a : addrs) ipList.add(a.getHostAddress());
            targetIp = addrs[0];
            sb.append("[1. DNS SUCCESS] in ").append(dDns).append("ms -> IPs: ").append(ipList).append("\n");
        } catch (Throwable t) {
            long dDns = System.currentTimeMillis() - tDns;
            sb.append("[1. DNS FAILED] in ").append(dDns).append("ms: ").append(formatDetailedException(t)).append("\n");
            return sb.toString();
        }

        // Stage 2: TCP Socket Connect
        long tTcp = System.currentTimeMillis();
        Socket socket = new Socket();
        try {
            socket.setTcpNoDelay(true);
            socket.connect(new InetSocketAddress(targetIp, port), 5000);
            long dTcp = System.currentTimeMillis() - tTcp;
            sb.append("[2. TCP CONNECT SUCCESS] to ").append(targetIp.getHostAddress()).append(":").append(port)
              .append(" in ").append(dTcp).append("ms (LocalPort: ").append(socket.getLocalPort()).append(")\n");
        } catch (Throwable t) {
            long dTcp = System.currentTimeMillis() - tTcp;
            sb.append("[2. TCP CONNECT FAILED] to ").append(targetIp.getHostAddress()).append(":").append(port)
              .append(" in ").append(dTcp).append("ms: ").append(formatDetailedException(t)).append("\n");
            try { socket.close(); } catch (Exception ignored) {}
            return sb.toString();
        }

        // Stage 3: TLS Handshake (with standard certificate checks intact)
        long tTls = System.currentTimeMillis();
        SSLSocket sslSocket = null;
        try {
            SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
            sslSocket = (SSLSocket) factory.createSocket(socket, host, port, true);
            sslSocket.startHandshake();
            long dTls = System.currentTimeMillis() - tTls;
            sb.append("[3. TLS HANDSHAKE SUCCESS] in ").append(dTls).append("ms -> Protocol: ")
              .append(sslSocket.getSession().getProtocol()).append(", Cipher: ")
              .append(sslSocket.getSession().getCipherSuite()).append("\n");
        } catch (Throwable t) {
            long dTls = System.currentTimeMillis() - tTls;
            sb.append("[3. TLS HANDSHAKE FAILED] in ").append(dTls).append("ms: ").append(formatDetailedException(t)).append("\n");
        } finally {
            if (sslSocket != null) {
                try { sslSocket.close(); } catch (Exception ignored) {}
            } else {
                try { socket.close(); } catch (Exception ignored) {}
            }
        }

        return sb.toString();
    }

    /**
     * Formats exception with class name, message, and all nested causes.
     */
    public static String formatDetailedException(Throwable t) {
        if (t == null) return "Unknown error (null)";
        StringBuilder sb = new StringBuilder();
        sb.append(t.getClass().getSimpleName());
        if (t.getMessage() != null && !t.getMessage().trim().isEmpty()) {
            sb.append(": ").append(t.getMessage().trim());
        }

        Throwable cause = t.getCause();
        int depth = 0;
        while (cause != null && cause != t && depth < 5) {
            sb.append(" -> caused by ").append(cause.getClass().getSimpleName());
            if (cause.getMessage() != null && !cause.getMessage().trim().isEmpty()) {
                sb.append(": ").append(cause.getMessage().trim());
            }
            cause = cause.getCause();
            depth++;
        }
        return sb.toString();
    }
}
