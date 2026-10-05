package com.trendscanner.bybit;

import static org.junit.Assert.*;

import org.junit.Test;

public class TrialPolicyTest {

    @Test
    public void testTrialPolicyPermitsScanning() {
        assertTrue(TrialPolicy.canScan());
        assertTrue(TrialPolicy.isFeatureUnlocked());
        assertTrue(TrialPolicy.getRemainingDays() > 0);
        assertNotNull(TrialPolicy.getStatusDescription());
    }
}
