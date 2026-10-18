package com.habitracker.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.habitracker.app.widgets.WidgetRefreshScheduler;

public class MainActivity extends BridgeActivity {

    /** Repaints widgets the moment the web app writes new data. */
    private SharedPreferences.OnSharedPreferenceChangeListener prefsListener;
    private SharedPreferences prefs;
    private long lastRefresh = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            WidgetRefreshScheduler.INSTANCE.scheduleAll(getApplicationContext());
            WidgetRefreshScheduler.INSTANCE.refreshAllNow(getApplicationContext());
        } catch (Throwable t) { /* ignore */ }

        try {
            prefs = getApplicationContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            prefsListener = (sp, key) -> {
                if (key == null) return;
                // Only react to widget payload keys, and throttle to once per second.
                long now = System.currentTimeMillis();
                if (now - lastRefresh < 1000L) return;
                lastRefresh = now;
                try {
                    WidgetRefreshScheduler.INSTANCE.refreshAllNow(getApplicationContext());
                } catch (Throwable t) { /* ignore */ }
            };
            prefs.registerOnSharedPreferenceChangeListener(prefsListener);
        } catch (Throwable t) { /* ignore */ }
    }

    @Override
    public void onPause() {
        super.onPause();
        // App is going to background — push latest data snapshot to widgets now.
        try { WidgetRefreshScheduler.INSTANCE.refreshAllNow(getApplicationContext()); } catch (Throwable t) {}
    }

    @Override
    public void onResume() {
        super.onResume();
        try { WidgetRefreshScheduler.INSTANCE.refreshAllNow(getApplicationContext()); } catch (Throwable t) {}
    }

    @Override
    public void onDestroy() {
        try {
            if (prefs != null && prefsListener != null) {
                prefs.unregisterOnSharedPreferenceChangeListener(prefsListener);
            }
        } catch (Throwable t) { /* ignore */ }
        super.onDestroy();
    }
}
