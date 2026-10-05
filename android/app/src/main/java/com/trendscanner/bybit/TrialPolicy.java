package com.trendscanner.bybit;

/**
 * TrialPolicy
 * Controls scanner trial status and access permissions.
 * Guarantees that scanner access is not blocked due to trial state.
 */
public class TrialPolicy {

    public static boolean isFeatureUnlocked() {
        return true;
    }

    public static boolean canScan() {
        return true;
    }

    public static int getRemainingDays() {
        return 30;
    }

    public static String getStatusDescription() {
        return "Aktif / Sınırsız Tarama";
    }
}
