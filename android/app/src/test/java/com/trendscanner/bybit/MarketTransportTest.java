package com.trendscanner.bybit;

import static org.junit.Assert.*;

import org.junit.Test;

public class MarketTransportTest {

    @Test
    public void testResponseModel() {
        MarketTransport.Response successResp = new MarketTransport.Response(200, "{\"retCode\":0}", true, null, "https://api.bybit.com");
        assertEquals(200, successResp.statusCode);
        assertTrue(successResp.isSuccessful);
        assertEquals("{\"retCode\":0}", successResp.body);
        assertEquals("", successResp.error);
        assertEquals("https://api.bybit.com", successResp.usedUrl);

        MarketTransport.Response errorResp = new MarketTransport.Response(500, "", false, "Server Error", "https://api.bytick.com");
        assertEquals(500, errorResp.statusCode);
        assertFalse(errorResp.isSuccessful);
        assertEquals("Server Error", errorResp.error);
        assertEquals("https://api.bytick.com", errorResp.usedUrl);
    }

    @Test
    public void testInvalidUrlReturnsErrorResponseWithoutCrash() {
        MarketTransport.Response resp = MarketTransport.get("", null, 1000);
        assertNotNull(resp);
        assertFalse(resp.isSuccessful);
        assertEquals(0, resp.statusCode);
        assertTrue(resp.error.contains("Invalid URL"));
    }
}
