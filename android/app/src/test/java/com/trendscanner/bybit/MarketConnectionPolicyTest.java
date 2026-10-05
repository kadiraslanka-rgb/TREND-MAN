package com.trendscanner.bybit;

import static org.junit.Assert.*;

import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.util.List;
import java.util.Map;
import org.junit.Test;

public class MarketConnectionPolicyTest {

    @Test
    public void testBybitUrlCandidatesIncludeBytickMirror() {
        String original = "https://api.bybit.com/v5/market/tickers?category=linear";
        List<String> candidates = MarketConnectionPolicy.getUrlCandidates(original);

        assertNotNull(candidates);
        assertTrue(candidates.size() >= 2);
        assertEquals(original, candidates.get(0));
        assertTrue(candidates.contains("https://api.bytick.com/v5/market/tickers?category=linear"));
    }

    @Test
    public void testBinanceUrlCandidatesIncludeMirrors() {
        String original = "https://fapi.binance.com/fapi/v1/ticker/24hr";
        List<String> candidates = MarketConnectionPolicy.getUrlCandidates(original);

        assertNotNull(candidates);
        assertTrue(candidates.size() >= 2);
        assertTrue(candidates.contains("https://fapi1.binance.com/fapi/v1/ticker/24hr"));
    }

    @Test
    public void testOkxUrlCandidatesIncludeAwsMirror() {
        String original = "https://www.okx.com/api/v5/market/tickers?instType=SWAP";
        List<String> candidates = MarketConnectionPolicy.getUrlCandidates(original);

        assertNotNull(candidates);
        assertTrue(candidates.size() >= 2);
        assertTrue(candidates.contains("https://aws.okx.com/api/v5/market/tickers?instType=SWAP"));
    }

    @Test
    public void testStandardHeadersContainRealisticUserAgent() {
        Map<String, String> headers = MarketConnectionPolicy.getStandardHeaders();
        assertNotNull(headers);
        String userAgent = headers.get("User-Agent");
        assertNotNull(userAgent);
        assertTrue(userAgent.contains("Mozilla"));
        assertTrue(userAgent.contains("Chrome") || userAgent.contains("Safari"));
        assertEquals("keep-alive", headers.get("Connection"));
    }

    @Test
    public void testIsRetriableNetworkErrorDetection() {
        assertTrue(MarketConnectionPolicy.isRetriableNetworkError(new SocketException("Connection reset by peer")));
        assertTrue(MarketConnectionPolicy.isRetriableNetworkError(new SocketTimeoutException("Read timed out")));
        assertTrue(MarketConnectionPolicy.isRetriableNetworkError(new RuntimeException("SSL handshake failed due to connection reset")));
        assertFalse(MarketConnectionPolicy.isRetriableNetworkError(new IllegalArgumentException("Invalid format")));
    }
}
