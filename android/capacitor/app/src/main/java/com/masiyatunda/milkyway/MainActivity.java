package com.masiyatunda.milkyway;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MilkyWayNativePlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
        // Starting offline opens the saved app instead of an error screen (see OfflineStartClient).
        OfflineStartClient client = new OfflineStartClient(getBridge());
        getBridge().setWebViewClient(client);
        client.watchNetwork(this);
    }
}
