package com.masiyatunda.milkyway;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

// Opening MilkyWay without a connection never stops at an error screen. The web app's service worker keeps the
// app shell, feed and media on the phone, so the page normally opens from there. If a start still fails, it is
// retried once from the saved copies (the WebView's own cache included). Only a phone that has never opened
// MilkyWay online gets the bundled start page, which opens the app by itself once the connection is back.
// While there is no network, the WebView prefers its saved copies; with a working network it loads normally.
public class OfflineStartClient extends BridgeWebViewClient {
    private static final String APP_HOST = "masiyatunda.com";
    private final Bridge bridge;
    private boolean retried = false;
    private boolean failed = false;

    public OfflineStartClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    void watchNetwork(Context context) {
        ConnectivityManager connectivity = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivity == null) return;
        setCacheMode(online(connectivity));
        try {
            connectivity.registerDefaultNetworkCallback(
                new ConnectivityManager.NetworkCallback() {
                    @Override
                    public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                        setCacheMode(capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
                    }

                    @Override
                    public void onLost(Network network) {
                        setCacheMode(false);
                    }
                }
            );
        } catch (RuntimeException ignored) {}
    }

    private static boolean online(ConnectivityManager connectivity) {
        Network network = connectivity.getActiveNetwork();
        NetworkCapabilities capabilities = network == null ? null : connectivity.getNetworkCapabilities(network);
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    private void setCacheMode(boolean online) {
        WebView view = bridge.getWebView();
        if (view == null) return;
        view.post(() -> view.getSettings().setCacheMode(online ? WebSettings.LOAD_DEFAULT : WebSettings.LOAD_CACHE_ELSE_NETWORK));
    }

    @Override
    public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
        super.onPageStarted(view, url, favicon);
        failed = false;
        if (view != null && view.getSettings() != null) {
            view.getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        if (!failed) retried = false;
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (request.isForMainFrame()) recover(view, request.getUrl());
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
        super.onReceivedHttpError(view, request, response);
        // Ordinary pages such as "not found" stay as they are; only a failing server is treated like no connection.
        if (request.isForMainFrame() && response.getStatusCode() >= 500) recover(view, request.getUrl());
    }

    private static boolean isApp(Uri url) {
        String host = url.getHost();
        return "https".equals(url.getScheme()) && host != null && (host.equals(APP_HOST) || host.endsWith("." + APP_HOST));
    }

    private void recover(WebView view, Uri url) {
        failed = true;
        String target = isApp(url) ? url.toString() : bridge.getAppUrl();
        if (!retried) {
            retried = true;
            view.post(() -> {
                view.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
                view.loadUrl(target);
            });
            return;
        }
        retried = false;
        view.post(() -> showStartPage(view, target));
    }

    private void showStartPage(WebView view, String target) {
        String html;
        try (InputStream input = view.getContext().getAssets().open("public/index.html")) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            html = output.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return;
        }
        html = html.replace("\"__MW_TARGET__\"", JSONObject.quote(target));
        view.loadDataWithBaseURL("https://localhost/", html, "text/html", "utf-8", null);
    }
}
